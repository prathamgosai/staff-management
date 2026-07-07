import {
  Injectable, Inject, BadRequestException, ConflictException,
  NotFoundException, UnauthorizedException,
} from "@nestjs/common";
import { Pool } from "pg";
import * as bcrypt from "bcrypt";
import { randomBytes, createHash } from "crypto";
import { DB_POOL } from "../../database/database.module";
import { assertOutletAllowed, allowedOutletIds } from "../../common/auth/outlet-scope";
import { toLocalDateStr } from "../../common/utils/week.util";
import type { AuthUser } from "@workforceiq/shared";

/** Resolved kiosk device context, stamped onto the request by KioskDeviceGuard. */
export interface KioskDevice {
  deviceId: string;
  tenantId: string;
  outletId: string;
}

// PIN brute-force guard. A 4-digit PIN behind only the per-IP throttle would be
// crackable at 30/min from the shared kiosk IP; lock a (device, employeeId) pair
// out after too many misses. In-memory (per API instance) — same approach as the
// roles outlet cache; adequate for a single-instance deployment.
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 5 * 60_000;

@Injectable()
export class KioskService {
  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  // key = `${deviceId}:${employeeId}` → { fails, until }
  private readonly pinAttempts = new Map<string, { fails: number; until: number }>();

  private static sha256(s: string): string {
    return createHash("sha256").update(s).digest("hex");
  }

  // ── Device management (manager, JWT + attendance:write) ──────────────────

  /** Enrol a kiosk device on an outlet. Returns the raw token ONCE — it is never
   *  stored in the clear, so a lost token means revoke + re-enrol. */
  async createDevice(user: AuthUser, outletId: string, label: string) {
    assertOutletAllowed(user, outletId);
    const clean = (label || "").trim();
    if (!clean) throw new BadRequestException("A device label is required.");

    // Verify the outlet belongs to the caller's tenant before binding a device.
    const outlet = await this.db.query(
      "SELECT id FROM outlets WHERE id = $1 AND tenant_id = $2",
      [outletId, user.tenantId],
    );
    if (!outlet.rows[0]) throw new NotFoundException("Outlet not found");

    // 32 random bytes → 43-char base64url token. Prefixed so it's recognisable in logs.
    const token = `kio_${randomBytes(32).toString("base64url")}`;
    const tokenHash = KioskService.sha256(token);

    const res = await this.db.query(
      `INSERT INTO kiosk_devices (tenant_id, outlet_id, label, token_hash, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, label, outlet_id, created_at`,
      [user.tenantId, outletId, clean, tokenHash, user.id],
    );
    // token is returned only here, on creation.
    return { data: { ...res.rows[0], token } };
  }

  /** List enrolled devices for an outlet (metadata only — never the token). */
  async listDevices(user: AuthUser, outletId: string) {
    assertOutletAllowed(user, outletId);
    const res = await this.db.query(
      `SELECT id, label, outlet_id, last_seen_at, revoked_at, created_at
       FROM kiosk_devices
       WHERE outlet_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC`,
      [outletId, user.tenantId],
    );
    return { data: res.rows };
  }

  /** Revoke a device (soft — keeps the audit row). Idempotent. */
  async revokeDevice(user: AuthUser, id: string) {
    const outletFilter = allowedOutletIds(user);
    const res = await this.db.query(
      `UPDATE kiosk_devices
         SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE id = $1 AND tenant_id = $2
         AND ($3::uuid[] IS NULL OR outlet_id = ANY($3))
       RETURNING id`,
      [id, user.tenantId, outletFilter],
    );
    if (!res.rows[0]) throw new NotFoundException("Device not found");
    return { data: { id, revoked: true } };
  }

  /** Set (or clear) a staff member's kiosk PIN. Managers only. A 4–6 digit PIN. */
  async setStaffPin(user: AuthUser, staffId: string, pin: string | null) {
    // Load the staff row and confirm it's in the caller's tenant + outlet scope.
    const outletFilter = allowedOutletIds(user);
    const staff = await this.db.query(
      `SELECT id FROM staff
        WHERE id = $1 AND tenant_id = $2
          AND ($3::uuid[] IS NULL OR current_outlet_id = ANY($3))`,
      [staffId, user.tenantId, outletFilter],
    );
    if (!staff.rows[0]) throw new NotFoundException("Staff member not found");

    if (pin === null || pin === "") {
      await this.db.query("UPDATE staff SET kiosk_pin_hash = NULL, updated_at = NOW() WHERE id = $1", [staffId]);
      return { data: { staffId, pinSet: false } };
    }
    if (!/^\d{4,6}$/.test(pin)) throw new BadRequestException("PIN must be 4 to 6 digits.");
    const hash = await bcrypt.hash(pin, 10);
    await this.db.query("UPDATE staff SET kiosk_pin_hash = $2, updated_at = NOW() WHERE id = $1", [staffId, hash]);
    return { data: { staffId, pinSet: true } };
  }

  // ── Device-token auth ────────────────────────────────────────────────────

  /** Resolve a raw device token to its live device, or throw 401. Also stamps
   *  last_seen_at (best-effort). Used by KioskDeviceGuard. */
  async resolveDevice(rawToken: string | undefined): Promise<KioskDevice> {
    if (!rawToken) throw new UnauthorizedException("Missing kiosk device token");
    const tokenHash = KioskService.sha256(rawToken);
    const res = await this.db.query(
      `UPDATE kiosk_devices SET last_seen_at = NOW()
        WHERE token_hash = $1 AND revoked_at IS NULL
       RETURNING id, tenant_id, outlet_id`,
      [tokenHash],
    );
    const row = res.rows[0];
    if (!row) throw new UnauthorizedException("Invalid or revoked kiosk device");
    return { deviceId: row.id, tenantId: row.tenant_id, outletId: row.outlet_id };
  }

  // ── Kiosk punches (device-token auth, no user) ───────────────────────────

  /** Public session info for the kiosk screen: which outlet this device serves. */
  async session(device: KioskDevice) {
    const res = await this.db.query(
      "SELECT id, name, code FROM outlets WHERE id = $1 AND tenant_id = $2",
      [device.outletId, device.tenantId],
    );
    const outlet = res.rows[0];
    if (!outlet) throw new NotFoundException("Outlet not found");
    return { data: { outletId: outlet.id, outletName: outlet.name, outletCode: outlet.code } };
  }

  /** Find + verify a staff member by Employee ID + PIN, scoped to the device's
   *  outlet. Uniform error on any mismatch so the kiosk can't enumerate staff. */
  private async authStaff(device: KioskDevice, employeeId: string, pin: string) {
    if (!employeeId?.trim() || !pin?.trim()) {
      throw new BadRequestException("Employee ID and PIN are required.");
    }
    // Brute-force guard: a short PIN behind only the per-IP throttle is crackable
    // from the shared kiosk IP. Lock a (device, employeeId) pair after too many
    // misses, checked BEFORE the DB hit so a lockout can't be probed for timing.
    const key = `${device.deviceId}:${employeeId.trim().toLowerCase()}`;
    const now = Date.now();
    const rec = this.pinAttempts.get(key) ?? { fails: 0, until: 0 };
    if (rec.until > now) {
      throw new UnauthorizedException(`Too many attempts. Try again in ${Math.ceil((rec.until - now) / 1000)}s.`);
    }

    const res = await this.db.query(
      `SELECT id, name, kiosk_pin_hash
         FROM staff
        WHERE tenant_id = $1 AND current_outlet_id = $2
          AND lower(employee_id) = lower($3)
          AND employment_status NOT IN ('terminated','resigned')`,
      [device.tenantId, device.outletId, employeeId.trim()],
    );
    const staff = res.rows[0];
    // Uniform 401 whether the ID is unknown, the PIN unset, or the PIN wrong.
    const ok = !!staff && !!staff.kiosk_pin_hash && (await bcrypt.compare(pin.trim(), staff.kiosk_pin_hash));
    if (!ok) {
      rec.fails += 1;
      if (rec.fails >= PIN_MAX_ATTEMPTS) { rec.until = now + PIN_LOCKOUT_MS; rec.fails = 0; }
      this.pinAttempts.set(key, rec);
      throw new UnauthorizedException("Incorrect Employee ID or PIN.");
    }
    this.pinAttempts.delete(key); // reset the counter on a successful punch
    return { id: staff.id as string, name: staff.name as string };
  }

  /** Clock the staff member IN at this device's outlet (source='kiosk'). */
  async clockIn(device: KioskDevice, employeeId: string, pin: string) {
    const staff = await this.authStaff(device, employeeId, pin);
    // Local date, NOT toISOString() (UTC) — attendance is bucketed per local day
    // to match the roster's local-Monday week keys; UTC would misdate/lose
    // early-morning IST punches. See common/utils/week.util.ts.
    const today = toLocalDateStr(new Date());

    // Check for ANY record today, not just an open one: attendance_records has
    // UNIQUE(staff_id, date), so a second INSERT after a completed cycle (or a
    // manager's manual entry) would 500. Give a clean message instead.
    const existing = await this.db.query(
      "SELECT clock_out FROM attendance_records WHERE staff_id = $1 AND date = $2",
      [staff.id, today],
    );
    if (existing.rows[0]) {
      throw new ConflictException(
        existing.rows[0].clock_out
          ? `${staff.name} has already completed attendance for today.`
          : `${staff.name} is already clocked in.`,
      );
    }

    const res = await this.db.query(
      `INSERT INTO attendance_records
         (staff_id, outlet_id, date, clock_in, status, clock_in_method, source)
       VALUES ($1, $2, $3, NOW(), 'present', 'kiosk', 'kiosk')
       RETURNING id, clock_in`,
      [staff.id, device.outletId, today],
    );
    return { data: { action: "clock-in", staffName: staff.name, at: res.rows[0].clock_in } };
  }

  /** Clock the staff member OUT of their open record for today (source='kiosk'). */
  async clockOut(device: KioskDevice, employeeId: string, pin: string) {
    const staff = await this.authStaff(device, employeeId, pin);
    // Local date (see clockIn) so clock-out finds the same day's open record.
    const today = toLocalDateStr(new Date());

    const open = await this.db.query(
      `SELECT id, clock_in, break_minutes FROM attendance_records
        WHERE staff_id = $1 AND outlet_id = $2 AND date = $3 AND clock_out IS NULL
        ORDER BY clock_in DESC LIMIT 1`,
      [staff.id, device.outletId, today],
    );
    const record = open.rows[0];
    if (!record) throw new ConflictException(`${staff.name} is not currently clocked in.`);

    const totalMinutes = (Date.now() - new Date(record.clock_in).getTime()) / 60000;
    const breakMinutes = record.break_minutes || 0;
    const regularHours = Math.min((totalMinutes - breakMinutes) / 60, 8);
    const overtimeHours = Math.max(0, (totalMinutes - breakMinutes) / 60 - 8);

    const res = await this.db.query(
      `UPDATE attendance_records
         SET clock_out = NOW(), clock_out_method = 'kiosk',
             regular_hours = $2, overtime_hours = $3, updated_at = NOW()
       WHERE id = $1 RETURNING clock_out`,
      [record.id, regularHours.toFixed(2), overtimeHours.toFixed(2)],
    );
    return { data: { action: "clock-out", staffName: staff.name, at: res.rows[0].clock_out } };
  }
}
