import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { toLocalDateStr } from "../../common/utils/week.util";
import { MagicLinkService, type MagicPayload } from "./magic-link.service";

@Injectable()
export class PublicService {
  constructor(
    @Inject(DB_POOL) private readonly db: Pool,
    private readonly magic: MagicLinkService,
  ) {}

  /**
   * Resolve a magic-link token to EXACTLY ONE staff member's PUBLISHED week. Every
   * failure mode — disabled feature, bad signature, expiry, tampered token, missing
   * staff, or an unpublished week — returns a uniform 404 (no oracle). The staff id and
   * tenant come from the SIGNED token only, never a query param, and rows are filtered by
   * BOTH, so one staff's link can never surface another's shifts.
   */
  async getMyWeekByToken(token: string) {
    let payload: MagicPayload;
    try {
      payload = this.magic.verify(token);
    } catch {
      throw new NotFoundException("Not found");
    }
    const { staffId, weekKey, tenantId } = payload;
    if (!staffId || !weekKey || !tenantId) throw new NotFoundException("Not found");

    const staffRes = await this.db.query(
      "SELECT id, name, current_outlet_id FROM staff WHERE id = $1 AND tenant_id = $2",
      [staffId, tenantId],
    );
    const staff = staffRes.rows[0];
    if (!staff) throw new NotFoundException("Not found");

    const pub = await this.db.query(
      "SELECT published_at FROM schedules WHERE outlet_id = $1 AND week_start_date = $2 AND status = 'published'",
      [staff.current_outlet_id, weekKey],
    );
    if (!pub.rows[0]) throw new NotFoundException("Not found");

    const shiftsRes = await this.db.query(
      `SELECT ss.date, ss.start_time, ss.end_time, ss.is_overnight,
              st.name AS shift_name, o.name AS outlet_name
         FROM shift_assignments sa
         JOIN schedule_shifts ss ON ss.id = sa.shift_id
         JOIN schedules sc ON sc.id = ss.schedule_id AND sc.status = 'published'
         LEFT JOIN shift_templates st ON st.id = ss.template_id
         LEFT JOIN outlets o ON o.id = ss.outlet_id
        WHERE sa.staff_id = $1 AND sa.status <> 'cancelled' AND sc.week_start_date = $2
        ORDER BY ss.date, ss.start_time`,
      [staffId, weekKey],
    );
    const shifts = shiftsRes.rows.map((r: Record<string, unknown>) => ({
      date: toLocalDateStr(r.date as Date | string),
      startTime: (r.start_time as string | null ?? "").slice(0, 5),
      endTime: (r.end_time as string | null ?? "").slice(0, 5),
      isOvernight: r.is_overnight,
      shiftName: r.shift_name,
      outletName: r.outlet_name,
    }));

    return {
      data: {
        firstName: String(staff.name || "").split(" ")[0],
        weekKey,
        publishedAt: pub.rows[0].published_at,
        shifts,
      },
    };
  }
}
