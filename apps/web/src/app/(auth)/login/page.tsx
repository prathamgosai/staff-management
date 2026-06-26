"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/store/auth.store";
import { apiClient } from "@/lib/api-client";
import { Eye, EyeOff, CheckSquare, Square } from "lucide-react";

const REMEMBER_KEY = "wiq_remember";

const loginSchema = z.object({
  email: z.string().min(1, "Employee ID or email is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [error, setError]           = useState<string | null>(null);
  const [isPending, setIsPending]   = useState(false);
  const [isLoading, setIsLoading]   = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  // Auto-fill saved credentials on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        const { email, password } = JSON.parse(atob(saved));
        if (email) { setValue("email", email); setRememberMe(true); }
        if (password) setValue("password", password);
      }
    } catch {
      localStorage.removeItem(REMEMBER_KEY);
    }
  }, [setValue]);

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);
    setIsPending(false);
    try {
      const email = data.email.includes("@")
        ? data.email
        : `${data.email.toLowerCase()}@workforceiq.app`;
      const response = await apiClient.post("/auth/login", { email, password: data.password });
      const { data: user, accessToken, refreshToken } = response.data;

      // Save or clear remembered credentials
      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, btoa(JSON.stringify({ email: data.email, password: data.password })));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      setAuth(user, accessToken, refreshToken);
      router.push("/dashboard");
    } catch (err: unknown) {
      const status  = (err as { response?: { status?: number } }).response?.status;
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      if (status === 403) {
        setIsPending(true);
        setError(message ?? "Your account is pending approval.");
      } else {
        setError(message ?? "Login failed. Please check your credentials.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      <div className="w-full max-w-md px-4">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Top band */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-8 text-white text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/20 mb-3">
              <span className="text-2xl font-black">W</span>
            </div>
            <h1 className="text-2xl font-bold">WorkforceIQ</h1>
            <p className="text-blue-100 text-sm mt-1">Restaurant Workforce Management</p>
          </div>

          <div className="px-8 py-8">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Welcome back</h2>
            <p className="text-sm text-gray-500 mb-6">Sign in with your Employee ID or email</p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Employee ID / Email */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Employee ID / Email
                </label>
                <input
                  {...register("email")}
                  type="text"
                  autoComplete="username"
                  placeholder="CP-001 or admin@workforceiq.app"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-sm"
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    {...register("password")}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Your password"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
                )}
              </div>

              {/* Remember Me */}
              <button
                type="button"
                onClick={() => setRememberMe(v => !v)}
                className="flex items-center gap-2.5 group select-none">
                <span className={`transition-colors ${rememberMe ? "text-blue-600" : "text-gray-300 group-hover:text-gray-400"}`}>
                  {rememberMe ? <CheckSquare size={18} /> : <Square size={18} />}
                </span>
                <span className="text-sm text-gray-600 group-hover:text-gray-800 transition-colors">
                  Remember me
                </span>
              </button>

              {/* Error */}
              {error && (
                <div className={`rounded-xl p-3.5 text-sm ${
                  isPending
                    ? "bg-amber-50 border border-amber-200 text-amber-800"
                    : "bg-red-50 border border-red-200 text-red-700"
                }`}>
                  {isPending && <p className="font-semibold mb-0.5">Account Pending Approval</p>}
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition text-sm mt-2">
                {isLoading ? "Signing in…" : "Sign In"}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-gray-100 text-center">
              <p className="text-sm text-gray-500">
                New staff?{" "}
                <Link href="/register" className="text-blue-600 hover:text-blue-700 font-semibold">
                  Create your account
                </Link>
              </p>
            </div>

            <p className="text-center text-xs text-gray-400 mt-4">
              Admin demo: admin@workforceiq.app / Admin@123
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
