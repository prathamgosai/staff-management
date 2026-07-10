/**
 * IST (Asia/Kolkata) day-boundary helpers. All "today" logic in the workforce-intelligence
 * features runs in IST regardless of the server's timezone (Render runs UTC), so day
 * boundaries match how the business — and the existing rotation scheduler — reason about a day.
 *
 * For DB-side comparisons prefer the SQL idiom `(NOW() AT TIME ZONE 'Asia/Kolkata')::date`,
 * which is correct irrespective of the database session timezone.
 */
export const IST_TZ = "Asia/Kolkata";

/** Today's date in IST as `YYYY-MM-DD` (en-CA formats ISO-style). */
export function istTodayStr(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: IST_TZ });
}

/** `YYYY-MM-DD` `days` from IST-today (negative = past). */
export function istDatePlus(days: number, now: Date = new Date()): string {
  const base = new Date(`${istTodayStr(now)}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}
