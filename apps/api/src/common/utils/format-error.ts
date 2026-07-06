/**
 * Human-readable message for any error. An AggregateError (e.g. the pg Pool
 * failing to connect on both ::1 and 127.0.0.1) has an empty `.message` that would
 * otherwise log as a blank line — surface the inner errors so failures stay
 * diagnosable. This mirrors the rotation scheduler's local helper so the
 * notification worker unwraps AggregateError exactly the same way.
 */
export function formatError(e: unknown): string {
  if (e instanceof AggregateError) {
    const inner = e.errors
      .map((x) => (x instanceof Error ? x.message : String(x)))
      .join("; ");
    return `${e.message || "AggregateError"} [${inner}]`;
  }
  return e instanceof Error ? e.message : String(e);
}
