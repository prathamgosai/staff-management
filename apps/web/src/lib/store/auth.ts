import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  selectedOutletId: string | null;
  _hasHydrated: boolean;

  setAuth: (data: { user: User; accessToken: string; refreshToken: string }) => void;
  setOutlet: (outletId: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  setHasHydrated: (val: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      selectedOutletId: null,
      _hasHydrated: false,

      setHasHydrated: (val) => set({ _hasHydrated: val }),

      setAuth: ({ user, accessToken, refreshToken }) => {
        const outletId =
          get().selectedOutletId ||
          (user.outletIds?.length ? user.outletIds[0] : null);
        set({ user, accessToken, refreshToken, selectedOutletId: outletId });
      },

      setOutlet: (outletId) => set({ selectedOutletId: outletId }),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          selectedOutletId: null,
        }),

      isAuthenticated: () => !!get().accessToken && !!get().user,
    }),
    {
      name: "wiq-auth",
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        selectedOutletId: s.selectedOutletId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
