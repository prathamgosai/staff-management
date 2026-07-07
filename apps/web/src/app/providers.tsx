"use client";

import { QueryClient, MutationCache, useIsFetching } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect, useRef, useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster, toast } from "@/components/ui/sonner";
import { getApiErrorMessage } from "@/lib/errors";
import { useAuthStore } from "@/store/auth.store";

// Only these read queries are persisted to localStorage so a cold Render start paints
// last-known data instantly while a background refetch runs. Keyed on the first key
// segment. Bump CACHE_BUSTER to invalidate all persisted caches after a breaking change.
const PERSISTED_KEYS = new Set([
  "my-week",
  "me-leave",
  "me-profile",
  "weekly-roster",
  "schedule-record",
  "staff",
  "notifications-unread-count",
]);
const CACHE_BUSTER = "wfiq-cache-v1";

/** Slim top banner shown when the API takes >4s to answer (free-tier cold start). */
function WakingBanner() {
  const isFetching = useIsFetching();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isFetching > 0) {
      if (timer.current === null && !dismissed) {
        timer.current = setTimeout(() => setShow(true), 4000);
      }
    } else {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      setShow(false); // auto-hide on first success (nothing left fetching)
    }
  }, [isFetching, dismissed]);

  if (!show) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-warning/15 px-4 py-1.5 text-xs font-medium text-warning"
    >
      <span className="size-3 animate-spin rounded-full border-2 border-warning border-t-transparent" />
      <span>Waking the server… this can take up to a minute on the free tier.</span>
      <button
        onClick={() => {
          setDismissed(true);
          setShow(false);
        }}
        aria-label="Dismiss"
        className="ml-1 text-warning/70 transition hover:text-warning"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Empties the in-memory React Query cache whenever the signed-in identity changes
 * (sign-out → null, or a different user signing in on the same tab). The single
 * QueryClient lives for the tab's lifetime and client-side navigation never
 * remounts it, so without this the next user on a shared device could see the
 * previous user's cached data. logout() clears the *persisted* copy; this clears
 * the live one that actually renders.
 */
function AuthCacheReset({ client }: { client: QueryClient }) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const prev = useRef(userId);
  useEffect(() => {
    if (prev.current !== null && prev.current !== userId) {
      client.clear();
    }
    prev.current = userId;
  }, [userId, client]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            if (mutation.meta?.silentError) return;
            toast.error(getApiErrorMessage(error));
          },
        }),
        defaultOptions: {
          queries: {
            // Remote DB (Sydney, ~470ms): serve cached data aggressively; don't re-hit
            // the DB on every window refocus. Pages needing live data override staleTime.
            staleTime: 60 * 1000,
            gcTime: 10 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // SSR-safe: storage is undefined on the server, so the persister no-ops there.
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      key: "wfiq-query-cache",
    }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          buster: CACHE_BUSTER,
          maxAge: 1000 * 60 * 60 * 24, // 24h
          dehydrateOptions: {
            shouldDehydrateQuery: (q) =>
              q.state.status === "success" && PERSISTED_KEYS.has(String((q.queryKey as unknown[])?.[0])),
          },
        }}
      >
        <AuthCacheReset client={queryClient} />
        {children}
        <Toaster />
        <ReactQueryDevtools initialIsOpen={false} />
        <WakingBanner />
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
}
