"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { format } from "date-fns";
import { CalendarClock, CalendarDays, CalendarOff, Bell, ChevronRight, MapPin } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { Skeleton } from "@/components/ui/skeleton";

interface MyShift {
  shiftId: string;
  date: string;
  startTime: string;
  endTime: string;
  shiftName: string | null;
  outletName: string | null;
}
interface MyWeek {
  weekStartDate: string;
  published: boolean;
  shifts: MyShift[];
}
interface LeaveBalance {
  entitlement?: number | string;
  taken?: number | string;
  pending?: number | string;
}
interface LeaveReq {
  status: string;
  start_date?: string;
  end_date?: string;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const hhmm = (t?: string) => (t ?? "").slice(0, 5);
const shiftLabel = (n?: string | null) => (n ? n.split("(")[0].trim() : "");
function prettyDate(iso: string): string {
  try {
    return format(new Date(`${iso}T00:00:00`), "EEE d MMM");
  } catch {
    return iso;
  }
}

export default function MyDayPage() {
  const t = useTranslations("myDay");
  const user = useAuthStore((s) => s.user);
  const firstName = (user?.name || user?.email || "there").split(/[ @]/)[0];

  const { data: weekRes, isLoading: weekLoading } = useQuery<{ data: MyWeek }>({
    queryKey: ["my-week"],
    queryFn: () => apiClient.get("/scheduling/my-week").then((r) => r.data),
  });
  const { data: leaveRes, isLoading: leaveLoading } = useQuery<{ data: { balances: LeaveBalance[]; requests: LeaveReq[] } }>({
    queryKey: ["me-leave"],
    queryFn: () => apiClient.get("/me/leave").then((r) => r.data),
  });

  const week = weekRes?.data;
  const shifts = week?.shifts ?? [];
  const today = todayStr();
  const nextShift = shifts.find((s) => s.date >= today) ?? null;

  const leave = leaveRes?.data;
  const latestReq = leave?.requests?.[0];
  const totalBalance = (leave?.balances ?? []).reduce(
    (sum, b) => sum + Number(b.entitlement ?? 0) - Number(b.taken ?? 0) - Number(b.pending ?? 0),
    0,
  );

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("greeting", { name: firstName })} 👋</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Next shift — large, first */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <CalendarClock className="size-4 text-primary" /> {t("nextShift")}
        </div>
        {weekLoading ? (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
        ) : !week?.published ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("notPublished")}</p>
        ) : nextShift ? (
          <div className="mt-2">
            <p className="text-3xl font-bold text-foreground">
              {hhmm(nextShift.startTime)} – {hhmm(nextShift.endTime)}
            </p>
            <p className="mt-1 text-sm text-foreground">
              {prettyDate(nextShift.date)}
              {shiftLabel(nextShift.shiftName) ? ` · ${shiftLabel(nextShift.shiftName)}` : ""}
            </p>
            {nextShift.outletName && (
              <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-3.5" /> {nextShift.outletName}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t("noUpcoming")}</p>
        )}
      </section>

      {/* This week */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <CalendarDays className="size-4 text-primary" /> {t("thisWeek")}
          </div>
          <Link href="/scheduling" className="text-xs font-medium text-primary">{t("viewRoster")}</Link>
        </div>
        {weekLoading ? (
          <div className="mt-3 space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : !week?.published ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("notPublishedShort")}</p>
        ) : shifts.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("noShifts")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {shifts.map((s) => (
              <li key={s.shiftId} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm font-medium text-foreground">{prettyDate(s.date)}</span>
                <span className="text-right text-sm text-muted-foreground">
                  {hhmm(s.startTime)}–{hhmm(s.endTime)}
                  {shiftLabel(s.shiftName) ? ` · ${shiftLabel(s.shiftName)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Leave */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <CalendarOff className="size-4 text-primary" /> {t("leave")}
          </div>
          <Link href="/leave" className="text-xs font-medium text-primary">{t("manage")}</Link>
        </div>
        {leaveLoading ? (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-4 w-48 max-w-full" />
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-2xl font-bold text-foreground">
              {Number.isFinite(totalBalance) ? Math.max(0, Math.round(totalBalance * 10) / 10) : 0}{" "}
              <span className="text-sm font-normal text-muted-foreground">{t("daysAvailable")}</span>
            </p>
            {latestReq ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {t("latestRequest", { status: latestReq.status })}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{t("noRequests")}</p>
            )}
          </div>
        )}
      </section>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/leave" className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-card transition hover:bg-muted">
          <span className="text-sm font-semibold text-foreground">{t("requestLeave")}</span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
        <Link href="/notifications" className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-card transition hover:bg-muted">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Bell className="size-4" /> {t("notifications")}
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}
