import { useEffect, useState } from "react";

/**
 * Returns `value` only after it has stopped changing for `delay` ms.
 *
 * Use it to keep a text input responsive while throttling what it drives —
 * typing "Aabha" fires one query instead of five. React Query dedupes and
 * discards superseded fetches by query key, so debouncing the key is enough;
 * no manual AbortController is needed.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t); // a new keystroke cancels the pending update
  }, [value, delay]);

  return debounced;
}
