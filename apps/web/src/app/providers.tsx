"use client";

import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster, toast } from "@/components/ui/sonner";
import { getApiErrorMessage } from "@/lib/errors";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // App-wide safety net: every mutation error surfaces a toast with the
        // server's message. Pages can still add their own onError for inline
        // context; both run. Mutations that opt out set `meta.silentError`.
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            if (mutation.meta?.silentError) return;
            toast.error(getApiErrorMessage(error));
          },
        }),
        defaultOptions: {
          queries: {
            // The DB is remote (Sydney, ~470ms). Serve cached data aggressively so
            // switching tabs is instant, and stop re-hitting the DB on every window
            // refocus. Pages needing live data still override with staleTime: 0.
            staleTime: 60 * 1000,
            gcTime: 10 * 60 * 1000, // keep results ~10min so back-navigation is instant
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
