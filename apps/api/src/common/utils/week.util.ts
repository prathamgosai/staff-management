/**
 * Local-Monday week key. Returns the YYYY-MM-DD of the Monday of `date`'s week,
 * formatted from LOCAL components (never UTC) so it stays aligned with the web
 * client's date-fns startOfWeek(weekStartsOn: 1). Single source of truth for the
 * week-key invariant shared by the rotation scheduler and the /me endpoints —
 * do not fork this logic.
 */
export function getMondayStr(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  // Format from LOCAL components. toISOString() would convert to UTC and, for
  // any moment between 00:00–05:30 IST, shift the result back to Sunday — a date
  // the web app (which uses the local Monday) never queries.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Format a pg DATE (parsed as local midnight) or a date-ish string as
 * YYYY-MM-DD from LOCAL components, avoiding the UTC off-by-one that
 * toISOString() causes in +05:30. Mirrors the weekly-roster builder's helper.
 */
export function toLocalDateStr(d: Date | string): string {
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return String(d).substring(0, 10);
}
