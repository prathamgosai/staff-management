import { Injectable, Inject, ConflictException, NotFoundException } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { allowedOutletIds, assertOutletAllowed } from "../../common/auth/outlet-scope";
import { resolveLateness } from "../../common/utils/lateness.util";
import { evaluateGeofence } from "../../common/utils/geofence.util";
import { toLocalDateStr } from "../../common/utils/week.util";
import type { AuthUser } from "@workforceiq/shared";

@Injectable()
export class AttendanceService {
  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  async findAll(filters: { tenantId: string; outletFilter: string[] | null; date?: string; startDate?: string; endDate?: string; staffId?: string }) {
    const { tenantId, outletFilter, date, startDate, endDate, staffId } = filters;
    const conditions = ["s.tenant_id = $1"];
    const params: unknown[] = [tenantId];
    let i = 2;

    // Server-derived outlet scope — null = every outlet in the tenant (admins).
    conditions.push(`($${i}::uuid[] IS NULL OR ar.outlet_id = ANY($${i}))`); params.push(outletFilter); i++;
    if (date) { conditions.push(`ar.date = $${i++}`); params.push(date); }
    if (startDate && endDate) {
      conditions.push(`ar.date BETWEEN $${i++} AND $${i++}`);
      params.push(startDate, endDate);
    }
    if (staffId) { conditions.push(`ar.staff_id = $${i++}`); params.push(staffId); }

    const result = await this.db.query(
      `SELECT ar.*, s.name AS staff_name, s.employee_id, s.avatar_url
       FROM attendance_records ar
       JOIN staff s ON s.id = ar.staff_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY ar.date DESC, ar.clock_in DESC
       LIMIT 200`,
      params,
    );
    return { data: result.rows };
  }

  async clockIn(user: AuthUser, body: { staffId: string; outletId: string; shiftId?: string; method?: string; gpsLat?: number; gpsLng?: number }) {
    assertOutletAllowed(user, body.outletId);
    // Local date, NOT toISOString() (UTC) — attendance is bucketed per local day
    // to match the roster's local-Monday week keys, and the kiosk punch path
    // already does this. Under UTC an early-morning IST punch lands on the
    // previous day, dodging the duplicate check and misdating the record.
    const now = new Date();
    const today = toLocalDateStr(now);
    const existing = await this.db.query(
      "SELECT id FROM attendance_records WHERE staff_id = $1 AND date = $2 AND clock_out IS NULL",
      [body.staffId, today],
    );
    if (existing.rows.length > 0) throw new ConflictException("Staff is already clocked in");

    const [late, geo] = await Promise.all([
      resolveLateness(this.db, {
        tenantId: user.tenantId,
        staffId: body.staffId,
        date: today,
        shiftId: body.shiftId,
        at: now,
      }),
      // Verdict is computed here, from coordinates stored on the outlet — the client sends
      // readings only. gpsLat/gpsLng were accepted and silently discarded before this.
      evaluateGeofence(this.db, user.tenantId, {
        outletId: body.outletId,
        lat: body.gpsLat,
        lng: body.gpsLng,
        accuracyM: body.gpsAccuracyM,
        source: body.method === "kiosk" ? "kiosk" : "self",
      }),
    ]);

    const result = await this.db.query(
      `INSERT INTO attendance_records
         (staff_id, outlet_id, shift_id, date, clock_in, status, late_minutes, clock_in_method,
          gps_clock_in, geo_status, geo_reason, geo_distance_m, geo_accuracy_m)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7,
               CASE WHEN $8::float8 IS NULL THEN NULL ELSE point($9::float8, $8::float8) END,
               $10, $11, $12, $13)
       RETURNING *`,
      [
        body.staffId, body.outletId, body.shiftId ?? late.shiftId, today,
        late.status, late.lateMinutes, body.method ?? null,
        // point(x, y) is (longitude, latitude) — x is the east/west axis.
        body.gpsLat ?? null, body.gpsLng ?? null,
        geo.status, geo.reason, geo.distanceM, geo.accuracyM,
      ],
    );
    return { data: result.rows[0] };
  }

  async clockOut(user: AuthUser, body: { attendanceId: string; method?: string; gpsLat?: number; gpsLng?: number }) {
    await this.assertAttendanceInScope(user, body.attendanceId);
    const record = await this.db.query(
      "SELECT * FROM attendance_records WHERE id = $1 AND clock_out IS NULL",
      [body.attendanceId],
    );
    if (!record.rows[0]) throw new ConflictException("Attendance record not found or already clocked out");

    const clockIn = new Date(record.rows[0].clock_in);
    const clockOut = new Date();
    const totalMinutes = (clockOut.getTime() - clockIn.getTime()) / 60000;
    const breakMinutes = record.rows[0].break_minutes || 0;
    const regularHours = Math.min((totalMinutes - breakMinutes) / 60, 8);
    const overtimeHours = Math.max(0, (totalMinutes - breakMinutes) / 60 - 8);

    const result = await this.db.query(
      `UPDATE attendance_records
       SET clock_out = NOW(), clock_out_method = $2,
           regular_hours = $3, overtime_hours = $4, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [body.attendanceId, body.method ?? null, regularHours.toFixed(2), overtimeHours.toFixed(2)],
    );
    return { data: result.rows[0] };
  }

  /**
   * A manager records attendance on someone else's behalf.
   *
   * The GPS here is the MANAGER'S, not the staff member's — it evidences that whoever marked
   * this was standing at the outlet, not marking a shift from home. It is deliberately NOT
   * written to gps_clock_in (that column means "where the staff member punched"); putting a
   * manager's coordinates there would misattribute someone's location. It lands in geo_reason
   * instead, plainly labelled.
   */
  async manualEntry(user: AuthUser, body: {
    staffId: string; outletId: string; date: string;
    clockIn: string; clockOut?: string; status: string; note?: string;
    gpsLat?: number; gpsLng?: number; gpsAccuracyM?: number;
  }) {
    assertOutletAllowed(user, body.outletId);
    const { staffId, outletId, date, clockIn, clockOut, status, note } = body;

    const existing = await this.db.query(
      "SELECT id FROM attendance_records WHERE staff_id = $1 AND date = $2",
      [staffId, date],
    );
    if (existing.rows.length > 0) throw new ConflictException("Attendance record already exists for this staff on this date");

    let regularHours = 0;
    let overtimeHours = 0;
    if (clockIn && clockOut) {
      const totalMinutes = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 60000;
      regularHours = parseFloat(Math.min(totalMinutes / 60, 8).toFixed(2));
      overtimeHours = parseFloat(Math.max(0, totalMinutes / 60 - 8).toFixed(2));
    }

    // Where was the manager when they marked this? Judged against the same outlet geofence
    // as a real punch, so "marked from home" is visible rather than invisible.
    const geo = await evaluateGeofence(this.db, user.tenantId, {
      outletId,
      lat: body.gpsLat,
      lng: body.gpsLng,
      accuracyM: body.gpsAccuracyM,
      source: "self",
    });
    const markedBy = geo.status === "approved"
      ? `Marked by manager at the outlet (${Math.round(geo.distanceM ?? 0)}m away)`
      : `Marked by manager — ${geo.reason}`;

    const result = await this.db.query(
      `INSERT INTO attendance_records
         (staff_id, outlet_id, date, clock_in, clock_out, status, clock_in_method, regular_hours, overtime_hours, notes,
          geo_status, geo_reason, geo_distance_m, geo_accuracy_m)
       VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        staffId, outletId, date, clockIn, clockOut ?? null, status, regularHours, overtimeHours, note ?? null,
        geo.status, markedBy, geo.distanceM, geo.accuracyM,
      ],
    );
    return { data: result.rows[0] };
  }

  async requestCorrection(user: AuthUser, body: { attendanceId: string; correctedClockIn?: string; correctedClockOut?: string; reason: string }) {
    await this.assertAttendanceInScope(user, body.attendanceId);
    const result = await this.db.query(
      `INSERT INTO attendance_corrections (attendance_id, requested_by, corrected_clock_in, corrected_clock_out, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [body.attendanceId, user.id, body.correctedClockIn ?? null, body.correctedClockOut ?? null, body.reason],
    );
    return { data: result.rows[0] };
  }

  async reviewCorrection(user: AuthUser, id: string, action: "approve" | "reject") {
    await this.assertCorrectionInScope(user, id);
    const reviewerId = user.id;
    if (action === "approve") {
      const correction = await this.db.query("SELECT * FROM attendance_corrections WHERE id = $1", [id]);
      const c = correction.rows[0];
      await this.db.query(
        `UPDATE attendance_records
         SET clock_in = COALESCE($2, clock_in), clock_out = COALESCE($3, clock_out), updated_at = NOW()
         WHERE id = $1`,
        [c.attendance_id, c.corrected_clock_in, c.corrected_clock_out],
      );
    }
    const result = await this.db.query(
      `UPDATE attendance_corrections SET status = $2, approved_by = $3, approved_at = NOW() WHERE id = $1 RETURNING *`,
      [id, action === "approve" ? "approved" : "rejected", reviewerId],
    );
    return { data: result.rows[0] };
  }

  async getLiveStatus(user: AuthUser, outletId: string) {
    assertOutletAllowed(user, outletId);
    const result = await this.db.query(
      `SELECT ar.id, ar.staff_id, ar.clock_in, s.name, s.employee_id, s.avatar_url,
              p.name AS position_name
       FROM attendance_records ar
       JOIN staff s ON s.id = ar.staff_id
       LEFT JOIN positions p ON p.id = s.position_id
       WHERE ar.outlet_id = $1 AND s.tenant_id = $2 AND ar.date = CURRENT_DATE AND ar.clock_out IS NULL
       ORDER BY ar.clock_in`,
      [outletId, user.tenantId],
    );
    return { data: result.rows };
  }

  /** 404s unless the attendance record is in the caller's tenant AND allowed outlet. */
  private async assertAttendanceInScope(user: AuthUser, attendanceId: string): Promise<void> {
    const outletFilter = allowedOutletIds(user);
    const res = await this.db.query(
      `SELECT 1 FROM attendance_records ar
         JOIN staff s ON s.id = ar.staff_id
        WHERE ar.id = $1 AND s.tenant_id = $2
          AND ($3::uuid[] IS NULL OR ar.outlet_id = ANY($3))`,
      [attendanceId, user.tenantId, outletFilter],
    );
    if (!res.rows[0]) throw new NotFoundException("Attendance record not found");
  }

  /** 404s unless the correction's underlying record is in the caller's scope. */
  private async assertCorrectionInScope(user: AuthUser, correctionId: string): Promise<void> {
    const outletFilter = allowedOutletIds(user);
    const res = await this.db.query(
      `SELECT 1 FROM attendance_corrections c
         JOIN attendance_records ar ON ar.id = c.attendance_id
         JOIN staff s ON s.id = ar.staff_id
        WHERE c.id = $1 AND s.tenant_id = $2
          AND ($3::uuid[] IS NULL OR ar.outlet_id = ANY($3))`,
      [correctionId, user.tenantId, outletFilter],
    );
    if (!res.rows[0]) throw new NotFoundException("Correction not found");
  }
}
