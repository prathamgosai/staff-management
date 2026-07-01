import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  /** Desktop sidebar collapsed to icon-rail. Persisted. */
  sidebarCollapsed: boolean;
  /** Selected outlet context from the top-bar switcher. null = all outlets. Persisted. */
  selectedOutletId: string | null;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setSelectedOutletId: (id: string | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      selectedOutletId: null,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setSelectedOutletId: (id) => set({ selectedOutletId: id }),
    }),
    { name: "workforceiq-ui" },
  ),
);
