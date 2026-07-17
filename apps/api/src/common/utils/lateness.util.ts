import { Pool } from "pg";

/**
 * Lateness resolution for clock-in, shared by the manager-facing attendance
 * module and the kiosk. Both punch paths must agree, or the same arrival would
 * be "late" on one and "present" on the other.
 *
 * The `late` attendance_status and the `late_minutes` column shipped in 001 but
 * nothing ever wrote them — every clock-in hardcoded 'present', so the reports
 * page's "Late Days" column read a value with no producer and sat at 0 forever.
 */

/** Used when the tenant has no `late_grace_minutes` row (or 018 isn't applied). */
export const DEFAULT_LATE_GRACE_MINUTES = 10;

export interface Lateness {
  /** 'late' only once the grace period is exceeded. */
  status: "present" | "late";
  /** Whole minutes past the rostered start; 0 when early, on time, or unrostered. */
  lateMinutes: number;
  /** The shift the punch was matched to, or null when the staff isn't rostered. */
  shiftId: string | null;
}

const ON_TIME: Lateness = { status: "present", lateMinutes: 0, shiftId: null };

export async function getLateGraceMinutes(db: Pool, tenantId: string): Promise<number> {
  try {
    const r = await db.query(
      "SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = 'late_grace_minutes'",
      [tenantId],
    );
    const v = Number(r.rows[0]?.value);
    return Number.isFinite(v) && v >= 0 ? v : DEFAULT_LATE_GRACE_MINUTES;
  } catch {
    return DEFAULT_LATE_GRACE_MINUTES; // tenant_settings not migrated yet
  }
}

/**
 * Decide whether a punch at `at` is late for the staff member's rostered shift.
 *
 * Lateness needs a rostered start to measure against, so an unrostered punch is
 * reported 'present' rather than guessed at — we have no basis to call it late.
 *
 * `late_minutes` records the true minutes past start even inside the grace
 * period; grace only governs whether the punch is *labelled* late. So a 3-minute
 * arrival under a 10-minute grace stores 3 minutes with status 'present'.
 */
export async function resolveLateness(
  db: Pool,
  opts: { tenantId: string; staffId: string; date: string; shiftId?: string | null; at: Date },
): Promise<Lateness> {
  const { tenantId, staffId, date, shiftId, at } = opts;

  // start_time is a TIME and date a DATE, so `date + start_time` is a timestamp
  // WITHOUT a zone. Render it as text and let JS parse it in the server's local
  // zone — the same local-day convention the roster and kiosk already use
  // (see week.util.ts toLocalDateStr). Comparing against NOW() in SQL instead
  // would silently reinterpret it in the DB's zone, which is not ours.
  const startExpr = `to_char(ss.date + ss.start_time, 'YYYY-MM-DD"T"HH24:MI:SS') AS starts_at`;

  const shift = shiftId
    ? await db.query(
        `SELECT ss.id, ${startExpr} FROM schedule_shifts ss WHERE ss.id = $1`,
        [shiftId],
      )
    // A staff member can hold more than one shift in a day, so pick which one the
    // punch belongs to. An already-started shift wins over an upcoming one: at
    // 10:30 with shifts at 09:00 and 12:00 you are 90m late for the morning, not
    // early for the afternoon. Ranking purely by nearest start would call that a
    // tie (90m either way) and break it arbitrarily. Among started shifts take
    // the latest start, otherwise the soonest upcoming — both fall out of the
    // distance sort once started shifts are ordered first.
    : await db.query(
        `SELECT ss.id, ${startExpr}
           FROM shift_assignments sa
           JOIN schedule_shifts ss ON ss.id = sa.shift_id
          WHERE sa.staff_id = $1 AND ss.date = $2
          ORDER BY ((ss.date + ss.start_time) <= $3::timestamp) DESC,
                   ABS(EXTRACT(EPOCH FROM ((ss.date + ss.start_time) - $3::timestamp)))
          LIMIT 1`,
        [staffId, date, `${date}T${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`],
      );

  const row = shift.rows[0];
  if (!row?.starts_at) return ON_TIME;

  const lateMinutes = Math.max(0, Math.round((at.getTime() - new Date(row.starts_at).getTime()) / 60000));
  const grace = await getLateGraceMinutes(db, tenantId);
  return {
    status: lateMinutes > grace ? "late" : "present",
    lateMinutes,
    shiftId: row.id as string,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
