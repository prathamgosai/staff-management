"use client";

import { useState, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { apiClient } from "@/lib/api-client";
import { Eye, EyeOff, KeyRound } from "lucide-react";

// Mirror of ChangePasswordDto on the API: 8+ chars with an uppercase letter,
// a number, and a special character from this exact set. Kept in sync so the
// client never advertises or accepts a rule the server rejects.
const PASSWORD_POLICY = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,}$/;
const PASSWORD_HINT = "At least 8 characters, with an uppercase letter, a number, and a special character (!@#$%^&*)";

function apiMessage(err: unknown): string | undefined {
  const raw = (err as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
  return Array.isArray(raw) ? raw.join(" ") : raw;
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const { accessToken, mustChangePassword, clearMustChangePassword, logout, user, setAuth } = useAuthStore();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Must be signed in to reach this screen.
  useEffect(() => {
    if (!accessToken) router.replace("/login");
  }, [accessToken, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Only validate what we can know client-side. The CURRENT password is
    // verified by the server (bcrypt) — never compare it on the client, or a
    // mistyped current password is wrongly blamed on the new one.
    if (!current) { setError("Please enter your current password."); return; }
    if (!PASSWORD_POLICY.test(next)) {
      setError(`New password must be ${PASSWORD_HINT[0].toLowerCase()}${PASSWORD_HINT.slice(1)}.`);
      return;
    }
    if (next !== confirm) { setError("New passwords do not match."); return; }

    setSaving(true);
    try {
      const { data } = await apiClient.post("/auth/change-password", {
        currentPassword: current,
        newPassword: next,
        confirmPassword: confirm,
      });
      // The endpoint re-issues a fresh token pair (other sessions are revoked).
      // Adopt it so this session stays signed in instead of dying on next refresh.
      if (user && data?.accessToken && data?.refreshToken) {
        setAuth(user, data.accessToken, data.refreshToken, false);
      } else {
        clearMustChangePassword();
      }
      router.replace("/dashboard");
    } catch (err) {
      setError(apiMessage(err) ?? "Could not update password. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-7 text-white text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-card/20 mb-3">
              <KeyRound size={24} />
            </div>
            <h1 className="text-xl font-bold">Set a new password</h1>
            <p className="text-blue-100 text-sm mt-1">
              {mustChangePassword
                ? "Your account requires a new password before you can continue."
                : "Update your account password."}
            </p>
          </div>

          <form onSubmit={onSubmit} className="px-8 py-7 space-y-4">
            {mustChangePassword && (
              <div className="rounded-xl bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 px-3.5 py-3 text-xs text-blue-800 dark:text-blue-300">
                Enter the password you just signed in with as your <strong>current password</strong>, then choose a new one.
              </div>
            )}

            <Field
              label={mustChangePassword ? "Current (temporary) password" : "Current password"}
              value={current} onChange={setCurrent} show={show} autoFocus
              autoComplete="current-password"
              hint={mustChangePassword ? "The password you just used to sign in" : undefined}
            />
            <Field label="New password" value={next} onChange={setNext} show={show}
              autoComplete="new-password" hint={PASSWORD_HINT} />
            <Field label="Confirm new password" value={confirm} onChange={setConfirm} show={show}
              autoComplete="new-password" />

            <button type="button" onClick={() => setShow(v => !v)}
              className="flex items-center gap-1.5 -mx-2 px-2 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg">
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
              {show ? "Hide passwords" : "Show passwords"}
            </button>

            {error && (
              <div role="alert" aria-live="assertive"
                className="rounded-xl p-3 text-sm bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <button type="submit" disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition text-sm">
              {saving ? "Saving…" : "Update Password"}
            </button>

            <button type="button" onClick={() => { logout(); router.replace("/login"); }}
              className="w-full text-center text-sm font-medium text-muted-foreground hover:text-foreground underline py-2.5 min-h-[44px]">
              Sign out instead
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, show, hint, autoFocus, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void;
  show: boolean; hint?: string; autoFocus?: boolean; autoComplete?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-foreground mb-1.5">{label}</label>
      <input
        id={id}
        name={autoComplete ?? id}
        type={show ? "text" : "password"}
        value={value}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        onChange={e => onChange(e.target.value)}
        className="w-full px-4 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-base"
      />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
