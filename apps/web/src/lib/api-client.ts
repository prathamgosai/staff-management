import axios from "axios";
import { useAuthStore } from "@/store/auth.store";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: false,
});

apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = useAuthStore.getState().accessToken;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Single-flight refresh: concurrent 401s share ONE /auth/refresh call, so the
// single-use refresh token is rotated exactly once per expiry burst. Without
// this, a second 401'd request would present an already-rotated token, get
// rejected, and force a spurious logout.
let refreshPromise: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const { refreshToken, setAuth, user, mustChangePassword } = useAuthStore.getState();
      if (!refreshToken || !user) throw new Error("No refresh token");
      const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
      // Carry the forced-change gate across rotation (the refresh response doesn't return it).
      setAuth(user, data.accessToken, data.refreshToken, mustChangePassword);
      return data.accessToken as string;
    })().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url: string = originalRequest?.url ?? "";
    // Auth endpoints own their 401s: wrong-password / invalid-credentials / a
    // failed refresh must reach the page as an error, NOT trigger a refresh+retry
    // that logs the user out and bounces them to /login.
    const isAuthRoute = url.includes("/auth/");
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthRoute) {
      originalRequest._retry = true;
      try {
        const accessToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch {
        useAuthStore.getState().logout();
        if (typeof window !== "undefined") window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);
