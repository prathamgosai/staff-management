"use client";

import { useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Eye, EyeOff, Loader2, CheckCircle, Copy, Check } from "lucide-react";

export default function RegisterPage() {
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [showCfm, setShowCfm]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [ticket, setTicket]     = useState<string | null>(null);
  const [copied, setCopied]     = useState(false);

  const passwordStrength = (() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  })();

  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][passwordStrength];
  const strengthColor = ["", "bg-red-400", "bg-amber-400", "bg-blue-400", "bg-emerald-500"][passwordStrength];

  function validate(): string | null {
    if (!name.trim() || name.trim().length < 2) return "Please enter your full name";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Please enter a valid email address";
    if (!password) return "Please set a password";
    if (password.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
    if (!/[0-9]/.test(password)) return "Password must contain at least one number";
    if (password !== confirm) return "Passwords do not match";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setLoading(true);
    try {
      const res = await apiClient.post("/auth/register", {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        confirmPassword: confirm,
      });
      setTicket(res.data.ticket);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg ?? "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function copyTicket() {
    if (!ticket) return;
    navigator.clipboard.writeText(ticket);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /* ── Success screen ───────────────────────────────────────────── */
  if (ticket) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-4">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-8 py-8 text-center text-white">
              <div className="w-16 h-16 bg-card/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle size={34} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold">Request Submitted!</h1>
              <p className="text-emerald-100 text-sm mt-1">Waiting for Head Chef approval</p>
            </div>

            <div className="px-8 py-8 space-y-5">
              {/* Ticket */}
              <div className="bg-muted border-2 border-dashed border-border rounded-2xl p-5 text-center">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Your Ticket Number</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl font-black font-mono text-foreground tracking-wider">{ticket}</span>
                  <button onClick={copyTicket}
                    className="p-2 rounded-xl bg-muted hover:bg-border text-muted-foreground transition">
                    {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Save this number — your Head Chef will need it</p>
              </div>

              {/* Steps */}
              <div className="space-y-3">
                {[
                  { n: "1", title: "Share your ticket", desc: `Give ticket ${ticket} to your Head Chef or Manager` },
                  { n: "2", title: "Head Chef reviews", desc: "They will approve your account from the Approvals panel" },
                  { n: "3", title: "You're in!", desc: `Sign in with ${email.trim().toLowerCase()} and your password` },
                ].map(step => (
                  <div key={step.n} className="flex gap-3 items-start">
                    <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {step.n}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground leading-tight">{step.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Credential reminder */}
              <div className="bg-blue-50 dark:bg-blue-500/15 border border-blue-100 dark:border-blue-500/30 rounded-2xl px-4 py-3.5">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">Your login credentials (once approved)</p>
                <div className="space-y-1 font-mono text-xs">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-16 shrink-0">Email:</span>
                    <span className="text-foreground font-semibold break-all">{email.trim().toLowerCase()}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-16 shrink-0">Password:</span>
                    <span className="text-foreground">the one you just set</span>
                  </div>
                </div>
              </div>

              <Link href="/login"
                className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition text-sm">
                Back to Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Registration form ────────────────────────────────────────── */
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-3xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-8 text-white text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-card/20 mb-3">
              <span className="text-2xl font-black">W</span>
            </div>
            <h1 className="text-2xl font-bold">Create Your Account</h1>
            <p className="text-blue-100 text-sm mt-1">WorkforceIQ Staff Portal</p>
          </div>

          <div className="px-8 py-7">
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Fill in your details below. After submitting, a ticket will be generated and your
              <strong className="text-foreground"> Head Chef</strong> will approve your access.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">Full Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Rahul Jatin Shah"
                  autoComplete="name"
                  className="w-full px-4 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">Email Address *</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  autoComplete="email"
                  className="w-full px-4 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">This will be your login ID</p>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">Password *</label>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min 8 chars, 1 uppercase, 1 number"
                    autoComplete="new-password"
                    className="w-full px-4 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm pr-10"
                  />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground">
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {/* Strength bar */}
                {password && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= passwordStrength ? strengthColor : "bg-muted"}`} />
                      ))}
                    </div>
                    <p className={`text-xs font-medium ${["", "text-red-500", "text-amber-500", "text-blue-500", "text-emerald-600"][passwordStrength]}`}>
                      {strengthLabel}
                    </p>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">Confirm Password *</label>
                <div className="relative">
                  <input
                    type={showCfm ? "text" : "password"}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm pr-10 ${
                      confirm && confirm !== password ? "border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15" : "border-border"
                    }`}
                  />
                  <button type="button" onClick={() => setShowCfm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground">
                    {showCfm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {confirm && confirm !== password && (
                  <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                )}
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 rounded-xl p-3.5 text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 mt-2">
                {loading
                  ? <><Loader2 size={15} className="animate-spin" /> Submitting…</>
                  : "Create Account & Generate Ticket"}
              </button>
            </form>

            <div className="mt-5 pt-5 border-t border-border text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="text-blue-600 hover:text-blue-700 font-semibold">Sign in</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
