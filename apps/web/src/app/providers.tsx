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
            staleTime: 60 * 1000,
            retry: 1,
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
