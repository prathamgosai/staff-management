"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarDays, MapPin, Clock } from "lucide-react";

interface Shift {
  date: string;
  startTime: string;
  endTime: string;
  shiftName: string | null;
  outletName: string | null;
}
interface MyWeek {
  firstName: string;
  weekKey: string;
  publishedAt: string;
  shifts: Shift[];
}

function prettyDate(iso: string): string {
  try {
    return format(new Date(`${iso}T00:00:00`), "EEE d MMM");
  } catch {
    return iso;
  }
}
const shiftLabel = (n?: string | null) => (n ? n.split("(")[0].trim() : "");

/** Read-only, logged-out roster view opened from a WhatsApp magic link. */
export function MagicWeek({ token }: { token: string }) {
  const [state, setState] = useState<{ loading: boolean; data: MyWeek | null; error: boolean }>({
    loading: true,
    data: null,
    error: false,
  });

  useEffect(() => {
    let alive = true;
    fetch(`/api/v1/public/my-week/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((j) => {
        if (alive) setState({ loading: false, data: j.data, error: false });
      })
      .catch(() => {
        if (alive) setState({ loading: false, data: null, error: true });
      });
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground">W</span>
          <span className="text-sm font-semibold text-muted-foreground">WorkforceIQ · Your roster</span>
        </div>

        {state.loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : state.error || !state.data ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <p className="font-semibold text-foreground">Link not available</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This roster link is invalid or has expired. Ask your manager for a new one.
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-foreground">Hi {state.data.firstName || "there"} 👋</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Week of {prettyDate(state.data.weekKey)}
              {state.data.publishedAt ? ` · Roster published ${format(new Date(state.data.publishedAt), "d MMM")}` : ""}
            </p>

            {state.data.shifts.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                You have no shifts this week.
              </div>
            ) : (
              <ul className="mt-5 space-y-2">
                {state.data.shifts.map((s, i) => (
                  <li key={i} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <CalendarDays className="size-4 text-primary" /> {prettyDate(s.date)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="size-3.5" /> {s.startTime}–{s.endTime}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {shiftLabel(s.shiftName) && <span>{shiftLabel(s.shiftName)}</span>}
                      {s.outletName && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" /> {s.outletName}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </main>
  );
}
