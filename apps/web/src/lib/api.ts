import axios from "axios";

// Same-origin path proxied to the backend by a Next.js rewrite (next.config.mjs).
const BASE_URL = "/api/v1";

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("wiq-auth");
      if (raw) {
        const parsed = JSON.parse(raw);
        // Zustand persist wraps data as { state: { accessToken, ... }, version: 0 }
        const accessToken = parsed?.state?.accessToken ?? parsed?.accessToken;
        if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
      }
    } catch {
      // ignore
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      const isLoginRoute = window.location.pathname === "/login";
      if (!isLoginRoute) {
        localStorage.removeItem("wiq-auth");
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post("/auth/login", { email, password }),
  me: () => apiClient.get("/auth/me"),
  refresh: (refreshToken: string) =>
    apiClient.post("/auth/refresh", { refreshToken }),
};

export const outletsApi = {
  list: () => apiClient.get("/outlets"),
  get: (id: string) => apiClient.get(`/outlets/${id}`),
};

export const staffApi = {
  list: (params?: { page?: number; limit?: number; outletId?: string; search?: string }) =>
    apiClient.get("/staff", { params }),
  get: (id: string) => apiClient.get(`/staff/${id}`),
  transfer: (staffId: string, toOutletId: string, reason?: string) =>
    apiClient.post("/staff/transfer", { staffId, toOutletId, reason }),
};

export const schedulingApi = {
  weeklyRoster: (outletId: string, weekStartDate: string) =>
    apiClient.get("/scheduling/weekly-roster", {
      params: { outletId, weekStartDate },
    }),
  generate: (outletId: string, weekStartDate: string) =>
    apiClient.post("/scheduling/schedules/generate", {
      outletId,
      weekStartDate,
    }),
};

export const attendanceApi = {
  list: (params?: { outletId?: string; date?: string; staffId?: string }) =>
    apiClient.get("/attendance", { params }),
  clockIn: (staffId: string, outletId: string) =>
    apiClient.post("/attendance/clock-in", { staffId, outletId }),
  clockOut: (attendanceId: string) =>
    apiClient.post(`/attendance/${attendanceId}/clock-out`),
};

export const leaveApi = {
  requests: (params?: { status?: string; outletId?: string }) =>
    apiClient.get("/leave/requests", { params }),
  types: () => apiClient.get("/leave/types"),
  apply: (data: {
    staffId: string;
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    reason: string;
  }) => apiClient.post("/leave/apply", data),
  approve: (id: string) => apiClient.patch(`/leave/requests/${id}/approve`),
  reject: (id: string, reason?: string) =>
    apiClient.patch(`/leave/requests/${id}/reject`, { reason }),
};
