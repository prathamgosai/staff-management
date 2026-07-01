"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { apiClient } from "@/lib/api-client";
import type { AuthUser } from "@workforceiq/shared";
import { DesktopSidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, accessToken, mustChangePassword, setUser } = useAuthStore();

  useEffect(() => {
    if (!accessToken) { router.replace("/login"); return; }
    // Accounts flagged for a forced reset can't use the app until they change it.
    if (mustChangePassword) router.replace("/change-password");
  }, [accessToken, mustChangePassword, router]);

  // Pull the caller's current permissions from the server so nav visibility
  // reflects any recent edits on the Account Types page (merge only permissions —
  // the token-derived /auth/me user has no name).
  useEffect(() => {
    if (!accessToken) return;
    apiClient.get("/auth/me")
      .then((r) => {
        const fresh = r.data?.data as AuthUser | undefined;
        const current = useAuthStore.getState().user;
        if (fresh?.permissions && current) setUser({ ...current, permissions: fresh.permissions });
      })
      .catch(() => { /* non-fatal: fall back to cached permissions */ });
  }, [accessToken, setUser]);

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[100rem] p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
