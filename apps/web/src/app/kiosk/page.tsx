"use client";

import { useCallback, useEffect, useState } from "react";
import { Delete, LogIn, LogOut, Loader2, CheckCircle2, XCircle, MonitorSmartphone } from "lucide-react";

const TOKEN_KEY = "wfiq-kiosk-token";
const API = "/api/v1/kiosk";

type Field = "employeeId" | "pin";
type Result = { ok: boolean; message: string } | null;

// Device-token fetch — this screen has NO user login, only the enrolled device
// token, sent as x-kiosk-token. Kept separate from the JWT apiClient on purpose.
async function kioskFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "x-kiosk-token": token, ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export default function KioskPage() {
  const [token, setToken] = useState<string | null>(null);
  const [outletName, setOutletName] = useState<string | null>(null);
  const [enrollState, setEnrollState] = useState<"loading" | "ok" | "unenrolled">("loading");

  const [field, setField] = useState<Field>("employeeId");
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  // 1) Resolve the device token: from ?token= (enrollment link) or localStorage.
  useEffect(() => {
    let t: string | null = null;
    try {
      const url = new URL(window.location.href);
      const fromUrl = url.searchParams.get("token");
      if (fromUrl) {
        localStorage.setItem(TOKEN_KEY, fromUrl);
        t = fromUrl;
        // Strip the token from the address bar so it isn't shoulder-surfed.
        url.searchParams.delete("token");
        window.history.replaceState({}, "", url.pathname + url.search);
      } else {
        t = localStorage.getItem(TOKEN_KEY);
      }
    } catch {
      t = null;
    }
    setToken(t);
    if (!t) setEnrollState("unenrolled");
  }, []);

  // 2) Validate the token + load the outlet name.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const { ok, body } = await kioskFetch(token, "/session");
      if (cancelled) return;
      if (ok && body?.data?.outletName) {
        setOutletName(body.data.outletName);
        setEnrollState("ok");
      } else {
        localStorage.removeItem(TOKEN_KEY);
        setEnrollState("unenrolled");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const press = useCallback((digit: string) => {
    setResult(null);
    if (field === "employeeId") setEmployeeId((v) => (v.length < 12 ? v + digit : v));
    else setPin((v) => (v.length < 6 ? v + digit : v));
  }, [field]);

  const backspace = useCallback(() => {
    if (field === "employeeId") setEmployeeId((v) => v.slice(0, -1));
    else setPin((v) => v.slice(0, -1));
  }, [field]);

  const reset = useCallback(() => { setEmployeeId(""); setPin(""); setField("employeeId"); }, []);

  async function punch(action: "clock-in" | "clock-out") {
    if (!token || busy) return;
    if (!employeeId.trim() || pin.length < 4) {
      setResult({ ok: false, message: "Enter your Employee ID and 4–6 digit PIN." });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const { ok, body } = await kioskFetch(token, `/${action}`, {
        method: "POST",
        body: JSON.stringify({ employeeId: employeeId.trim(), pin }),
      });
      if (ok && body?.data) {
        const verb = body.data.action === "clock-out" ? "Clocked out" : "Clocked in";
        setResult({ ok: true, message: `${verb} — ${body.data.staffName}. Have a great shift!` });
        reset();
      } else {
        const raw = body?.message;
        setResult({ ok: false, message: Array.isArray(raw) ? raw.join(" ") : raw || "Something went wrong. Try again." });
      }
    } catch {
      setResult({ ok: false, message: "Can't reach the server. Check the connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  // Auto-clear a result banner after a few seconds so the next person starts fresh.
  useEffect(() => {
    if (!result) return;
    const ms = result.ok ? 5000 : 4000;
    const id = window.setTimeout(() => setResult(null), ms);
    return () => window.clearTimeout(id);
  }, [result]);

  if (enrollState === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (enrollState === "unenrolled") {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-card">
          <MonitorSmartphone className="mx-auto size-12 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-bold text-foreground">Kiosk not set up</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This device isn&apos;t enrolled. A manager can enroll it from the outlet page
            (Outlets → open an outlet → Kiosk devices) and open the enrollment link on this device.
          </p>
        </div>
      </div>
    );
  }

  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-md flex-col">
        <header className="py-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clock in / out</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">{outletName}</h1>
        </header>

        {/* Result banner */}
        {result && (
          <div
            role="status"
            className={`mb-4 flex items-center gap-2 rounded-2xl border p-4 text-sm font-medium ${
              result.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300"
            }`}
          >
            {result.ok ? <CheckCircle2 className="size-5 shrink-0" /> : <XCircle className="size-5 shrink-0" />}
            <span>{result.message}</span>
          </div>
        )}

        {/* Entry fields */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setField("employeeId")}
            className={`rounded-2xl border p-4 text-left transition ${
              field === "employeeId" ? "border-primary ring-2 ring-primary/30" : "border-border"
            } bg-card`}
          >
            <span className="block text-xs font-medium text-muted-foreground">Employee ID</span>
            <span className="mt-1 block h-7 text-xl font-bold tracking-wider text-foreground">{employeeId || "—"}</span>
          </button>
          <button
            type="button"
            onClick={() => setField("pin")}
            className={`rounded-2xl border p-4 text-left transition ${
              field === "pin" ? "border-primary ring-2 ring-primary/30" : "border-border"
            } bg-card`}
          >
            <span className="block text-xs font-medium text-muted-foreground">PIN</span>
            <span className="mt-1 block h-7 text-xl font-bold tracking-[0.3em] text-foreground">
              {pin ? "•".repeat(pin.length) : "—"}
            </span>
          </button>
        </div>

        {/* Numeric keypad */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              className="rounded-2xl border border-border bg-card py-5 text-2xl font-semibold text-foreground transition active:scale-95 hover:bg-muted"
            >
              {k}
            </button>
          ))}
          <button
            type="button"
            onClick={reset}
            className="rounded-2xl border border-border bg-card py-5 text-sm font-semibold text-muted-foreground transition active:scale-95 hover:bg-muted"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => press("0")}
            className="rounded-2xl border border-border bg-card py-5 text-2xl font-semibold text-foreground transition active:scale-95 hover:bg-muted"
          >
            0
          </button>
          <button
            type="button"
            onClick={backspace}
            className="grid place-items-center rounded-2xl border border-border bg-card py-5 text-foreground transition active:scale-95 hover:bg-muted"
            aria-label="Backspace"
          >
            <Delete className="size-6" />
          </button>
        </div>

        {/* Actions */}
        <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
          <button
            type="button"
            disabled={busy}
            onClick={() => punch("clock-in")}
            className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-5 text-lg font-bold text-primary-foreground transition active:scale-95 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <LogIn className="size-5" />} Clock In
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => punch("clock-out")}
            className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-5 text-lg font-bold text-foreground transition active:scale-95 hover:bg-muted disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <LogOut className="size-5" />} Clock Out
          </button>
        </div>
      </div>
    </div>
  );
}
