"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/components/ui/sonner";
import {
  MapPin, MapPinOff, Clock, LogIn, LogOut, Loader2,
  CheckCircle2, AlertTriangle, ShieldAlert, RotateCw,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

interface ClockStatus {
  staffName: string;
  outletName: string;
  outletHasLocation: boolean;
  geofenceRadiusM: number | null;
  clockedIn: boolean;
  completedToday: boolean;
  record: {
    clockIn: string; clockOut: string | null; status: string;
    lateMinutes: number; geoStatus: string; geoReason: string | null; geoDistanceM: string | null;
  } | null;
}

type GeoState =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "ok"; lat: number; lng: number; accuracy: number }
  | { kind: "denied" }
  | { kind: "unavailable"; message: string }
  | { kind: "insecure" };

const GEO_BADGE: Record<string, { cls: string; label: string }> = {
  approved:       { cls: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300", label: "Location verified" },
  pending_review: { cls: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300",         label: "Awaiting manager review" },
  rejected:       { cls: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300",                 label: "Rejected" },
  not_evaluated:  { cls: "bg-muted text-muted-foreground",                                               label: "Location not checked" },
};

/**
 * Staff self-punch. The browser asks for location permission here; the reading is sent to
 * the server, which decides the verdict against the outlet's stored coordinates. Nothing on
 * this page determines approval — a page that decided its own verdict could be edited by
 * anyone with devtools.
 */
export default function PunchPage() {
  const qc = useQueryClient();
  const [geo, setGeo] = useState<GeoState>({ kind: "idle" });

  const { data, isLoading, isError, refetch } = useQuery<{ data: ClockStatus }>({
    queryKey: ["me-clock-status"],
    queryFn: () => apiClient.get("/me/clock-status").then(r => r.data),
    refetchInterval: 60_000,
  });
  const s = data?.data;

  /**
   * Ask the browser for a fix. getCurrentPosition only prompts on a secure origin
   * (HTTPS or localhost) — over plain HTTP on a LAN address the API is simply absent,
   * which is worth saying out loud rather than showing a silent failure.
   */
  function requestLocation(): Promise<GeoState> {
    return new Promise((resolve) => {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        resolve({ kind: "insecure" });
        return;
      }
      if (!navigator.geolocation) {
        resolve({ kind: "unavailable", message: "This device can't report a location." });
        return;
      }
      setGeo({ kind: "asking" });
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          kind: "ok",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
        (err) => resolve(
          err.code === err.PERMISSION_DENIED
            ? { kind: "denied" }
            : { kind: "unavailable", message: err.message || "Couldn't get a location fix." },
        ),
        // No cached fix: a stale position from this morning would place someone at the
        // restaurant hours after they left. High accuracy costs a few seconds and battery,
        // which is the right trade for a once-a-shift action.
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
      );
    });
  }

  // Ask on load so staff see their permission state before they need to punch.
  useEffect(() => { void requestLocation().then(setGeo); }, []);

  const punch = useMutation({
    mutationFn: async (action: "clock-in" | "clock-out") => {
      // Re-read position at the moment of punching rather than reusing the page-load fix,
      // which may be minutes old by now.
      const fresh = await requestLocation();
      setGeo(fresh);
      const body = fresh.kind === "ok"
        ? { gpsLat: fresh.lat, gpsLng: fresh.lng, gpsAccuracyM: fresh.accuracy }
        : {}; // server decides what a missing fix means; it does not silently pass
      return apiClient.post(`/me/${action}`, body).then(r => r.data);
    },
    onSuccess: (res, action) => {
      const st = res?.data?.geo_status;
      if (action === "clock-in") {
        if (st === "pending_review") toast.warning("Clocked in — sent to your manager for review.");
        else toast.success("Clocked in.");
      } else {
        toast.success("Clocked out.");
      }
      qc.invalidateQueries({ queryKey: ["me-clock-status"] });
    },
    onError: (e) => {
      const m = (e as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(", ") : m ?? "Couldn't record that. Please try again.");
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <div className="h-24 bg-muted rounded-2xl animate-pulse" />
        <div className="h-40 bg-muted rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (isError || !s) {
    return (
      <div className="mx-auto max-w-md text-center py-20">
        <ShieldAlert className="mx-auto text-muted-foreground mb-3" size={28} />
        <p className="text-sm font-semibold text-foreground mb-1">This page is for staff clocking themselves in.</p>
        {/* Admin logins typically aren't linked to a staff row, so this is the expected state
            for them — not a failure. Say which it is rather than "something went wrong". */}
        <p className="text-sm text-muted-foreground mb-3">
          Your account isn&apos;t linked to a staff profile, so there&apos;s no-one to clock in.
          Admins record attendance for others from the{" "}
          <Link href="/attendance" className="text-blue-600 font-semibold hover:underline">Attendance</Link> page instead.
        </p>
        <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline">
          <RotateCw size={13} /> Try again
        </button>
      </div>
    );
  }

  const badge = s.record ? GEO_BADGE[s.record.geoStatus] ?? GEO_BADGE.not_evaluated : null;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Clock in / out</h1>
        <p className="text-sm text-muted-foreground">
          {s.staffName} · {s.outletName} · {format(new Date(), "EEEE, d MMMM")}
        </p>
      </div>

      {/* Location state — the honest bit. Staff should know what is being read before they punch. */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-4">
        {geo.kind === "asking" && (
          <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Getting your location…
          </p>
        )}
        {geo.kind === "ok" && (
          <div className="flex items-start gap-2">
            <MapPin size={15} className="text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Location on</p>
              <p className="text-xs text-muted-foreground">
                Accurate to about {Math.round(geo.accuracy)}m. Your manager sees this with your punch.
              </p>
            </div>
          </div>
        )}
        {geo.kind === "denied" && (
          <div className="flex items-start gap-2">
            <MapPinOff size={15} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Location permission blocked</p>
              <p className="text-xs text-muted-foreground">
                You can still clock in, but it goes to your manager to approve. To enable it, tap the padlock
                in your browser&apos;s address bar and allow Location, then reload.
              </p>
              <button onClick={() => void requestLocation().then(setGeo)}
                className="mt-1.5 text-xs font-semibold text-blue-600 hover:underline">Try again</button>
            </div>
          </div>
        )}
        {geo.kind === "insecure" && (
          <div className="flex items-start gap-2">
            <MapPinOff size={15} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Location needs a secure connection</p>
              <p className="text-xs text-muted-foreground">
                Browsers only share location over HTTPS. Open this site on its https:// address —
                punches from here go to your manager for review.
              </p>
            </div>
          </div>
        )}
        {geo.kind === "unavailable" && (
          <div className="flex items-start gap-2">
            <MapPinOff size={15} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Couldn&apos;t get your location</p>
              <p className="text-xs text-muted-foreground">{geo.message} You can still clock in — it will be reviewed.</p>
              <button onClick={() => void requestLocation().then(setGeo)}
                className="mt-1.5 text-xs font-semibold text-blue-600 hover:underline">Try again</button>
            </div>
          </div>
        )}

        {/* Don't demand a permission that can't be used for anything yet. */}
        {!s.outletHasLocation && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-2.5 py-2 mt-3 inline-flex items-start gap-1.5">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            Your outlet&apos;s location hasn&apos;t been set yet, so your position can&apos;t be checked against it. Clocking in still works.
          </p>
        )}
      </div>

      {/* Today */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-4">
        {s.record ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Clock size={14} className="text-muted-foreground shrink-0" />
              <span className="text-foreground font-semibold">In {format(new Date(s.record.clockIn), "HH:mm")}</span>
              {s.record.clockOut && <span className="text-foreground font-semibold">· Out {format(new Date(s.record.clockOut), "HH:mm")}</span>}
              {s.record.status === "late" && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                  {s.record.lateMinutes}m late
                </span>
              )}
            </div>
            {badge && (
              <div className="flex items-start gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${badge.cls}`}>{badge.label}</span>
                {s.record.geoReason && <span className="text-xs text-muted-foreground">{s.record.geoReason}</span>}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">You haven&apos;t clocked in today.</p>
        )}

        {s.completedToday ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5">
            <CheckCircle2 size={14} /> Attendance complete for today.
          </p>
        ) : (
          <button
            onClick={() => punch.mutate(s.clockedIn ? "clock-out" : "clock-in")}
            disabled={punch.isPending || geo.kind === "asking"}
            className={`w-full inline-flex items-center justify-center gap-2 font-semibold py-3.5 rounded-xl text-sm text-white transition disabled:opacity-50 ${
              s.clockedIn ? "bg-slate-700 hover:bg-slate-800" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {punch.isPending ? <Loader2 size={15} className="animate-spin" />
              : s.clockedIn ? <LogOut size={15} /> : <LogIn size={15} />}
            {punch.isPending ? "Recording…" : s.clockedIn ? "Clock out" : "Clock in"}
          </button>
        )}

        {s.outletHasLocation && s.geofenceRadiusM && !s.completedToday && (
          <p className="text-[11px] text-muted-foreground text-center">
            You need to be within {s.geofenceRadiusM}m of {s.outletName}. Outside that, your punch is still
            recorded and sent to your manager.
          </p>
        )}
      </div>
    </div>
  );
}
