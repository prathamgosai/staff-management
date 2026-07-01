import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@workforceiq/shared";

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  mustChangePassword: boolean;
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string, mustChangePassword?: boolean) => void;
  setUser: (user: AuthUser) => void;
  clearMustChangePassword: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      mustChangePassword: false,
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
      logout: () => set({ user: null, accessToken: null, refreshToken: null, mustChangePassword: false }),
    }),
    {
      name: "workforceiq-auth",
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        mustChangePassword: state.mustChangePassword,
      }),
    },
  ),
);
