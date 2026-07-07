import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@workforceiq/shared";

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  mustChangePassword: boolean;
  /**
   * True once zustand has rehydrated this store from localStorage. Auth redirects
   * MUST wait for this — otherwise a page reload sees the still-default null token
   * for a tick and wrongly bounces a signed-in user to /login.
   */
  hasHydrated: boolean;
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string, mustChangePassword?: boolean) => void;
  setUser: (user: AuthUser) => void;
  clearMustChangePassword: () => void;
  setHasHydrated: (v: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      mustChangePassword: false,
      hasHydrated: false,
      setAuth: (user, accessToken, refreshToken, mustChangePassword) =>
        set((s) => ({
          user, accessToken, refreshToken,
          // Preserve the existing flag when the caller omits it (e.g. token refresh).
          mustChangePassword: mustChangePassword ?? s.mustChangePassword,
        })),
      // Refresh just the user (e.g. from /auth/me) without disturbing tokens —
      // keeps permissions current on sessions cached before permissions existed.
      setUser: (user) => set({ user }),
      clearMustChangePassword: () => set({ mustChangePassword: false }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
      logout: () => {
        // Drop the persisted TanStack Query cache too, so the next user on a shared
        // device (or a kiosk) can't see the previous user's cached data. The live
        // in-memory query cache is cleared by AuthCacheReset (providers.tsx) when the
        // user id changes; the service-worker /api cache is purged via postMessage.
        try {
          if (typeof window !== "undefined") {
            window.localStorage.removeItem("wfiq-query-cache");
            navigator.serviceWorker?.controller?.postMessage({ type: "wfiq-logout" });
          }
        } catch {
          /* ignore */
        }
        set({ user: null, accessToken: null, refreshToken: null, mustChangePassword: false });
      },
    }),
    {
      name: "workforceiq-auth",
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        mustChangePassword: state.mustChangePassword,
      }),
      // Flip hasHydrated once localStorage has been read back in. Fires even when
      // nothing was stored, so first-time visitors resolve too (and never hang).
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);
