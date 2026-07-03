/**
 * Normalises an unknown thrown value (usually an Axios error) into a single
 * human-friendly message. Prefers the API's `{ message }` (string or string[]),
 * falls back to status-specific copy, then a generic message.
 */
export function getApiErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const e = error as {
    response?: { status?: number; data?: { message?: string | string[] } };
    code?: string;
    message?: string;
  };

  if (e?.response) {
    const msg = e.response.data?.message;
    if (Array.isArray(msg) && msg.length) return msg.join(" · ");
    if (typeof msg === "string" && msg.trim()) return msg;
    if (e.response.status === 403) return "You don't have permission to do that.";
    if (e.response.status === 401) return "Your session expired. Please sign in again.";
    if (e.response.status === 404) return "That item could not be found.";
    return fallback;
  }

  if (e?.code === "ERR_NETWORK" || e?.message === "Network Error") {
    return "Network error — check your connection and that the API is running.";
  }

  return fallback;
}
