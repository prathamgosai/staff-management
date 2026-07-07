"use client";

import { useState, useEffect, useRef, type TouchEvent as ReactTouchEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  ChevronLeft, ChevronRight, Clock, Users, Building2,
  ChevronDown, Info, RefreshCw, Send, CheckCircle2, RotateCcw, Printer,
} from "lucide-react";
import { format, addWeeks, subWeeks, startOfWeek } from "date-fns";
import { toast } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";

/* ─── types ──────────────────────────────────────────────────────────── */
interface StaffInShift {
  staffId: string; name: string; employeeId: string;
  positionName: string; departmentName: string;
}
interface ShiftDateSlot { date: string; staff: StaffInShift[]; }
interface RosterShift {
  shiftName: string; shiftColor: string;
  startTime: string; endTime: string; isOvernight: boolean;
  dates: Record<string, ShiftDateSlot>;
}

// Style by the shift LABEL prefix (Shift A/B/C) rather than the full name, so a
// manually-edited time — which changes the "(HH:MM–HH:MM)" suffix — keeps its colour.
function shiftStyle(name: string): { bg: string; badge: string } {
  const n = (name ?? "").toLowerCase();
  if (n.startsWith("shift a")) return { bg: "border-l-blue-500 bg-blue-50 dark:bg-blue-500/15",    badge: "bg-blue-600" };
  if (n.startsWith("shift b")) return { bg: "border-l-purple-500 bg-purple-50 dark:bg-purple-500/15", badge: "bg-purple-600" };
  if (n.startsWith("shift c")) return { bg: "border-l-amber-500 bg-amber-50 dark:bg-amber-500/15",   badge: "bg-amber-500" };
  return { bg: "border-l-gray-400 bg-muted", badge: "bg-gray-500" };
}

// The roster groups by shift template NAME; the per-staff "Move to" dropdown
// needs the template. Match on the "Shift A/B/C" label prefix so an edited time
// suffix — e.g. "Shift A (12:00–21:00)" — doesn't break the match.
function labelKey(s: string): string {
  return (s ?? "").split("(")[0].trim().toLowerCase();
}

interface ShiftTemplate {
  id: string; name: string;
  start_time: string; end_time: string;
  is_overnight: boolean; break_minutes: number | null;
}

const DEPARTMENTS = [
  { label: "All Staff",   value: "" },
  { label: "Kitchen",     value: "Kitchen" },
  { label: "Service",     value: "Service" },
  { label: "Housekeeping",value: "Housekeeping" },
  { label: "FOH",         value: "FOH" },
  { label: "BOH",         value: "BOH" },
];

export default function SchedulingPage() {
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedOutletId, setSelectedOutletId] = useState("");
  const [expandedShift, setExpandedShift]       = useState<string | null>(null);
  const [selectedDay, setSelectedDay]           = useState<string | null>(null);
  const [deptFilter, setDeptFilter]             = useState("");
  const [mobileDayIdx, setMobileDayIdx]         = useState(0);
  const touchStartX = useRef<number | null>(null);

  const weekStartDate = format(currentWeek, "yyyy-MM-dd");

  // 7 days of the week
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Mobile day-first view defaults to today (when today falls in the shown week).
  useEffect(() => {
    const todayKey = format(new Date(), "yyyy-MM-dd");
    const idx = weekDays.findIndex(d => format(d, "yyyy-MM-dd") === todayKey);
    setMobileDayIdx(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartDate]);

  const swipeStart = (e: ReactTouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const swipeEnd = (e: ReactTouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 50) return;
    setMobileDayIdx(i => Math.min(6, Math.max(0, i + (dx < 0 ? 1 : -1))));
  };

  const { data: outletRes } = useQuery({
    queryKey: ["outlets"],
    queryFn: () => apiClient.get("/outlets").then(r => r.data),
  });

  const queryClient = useQueryClient();
  const rosterKey = ["weekly-roster", selectedOutletId, weekStartDate];

  const { data: rosterRes, isLoading } = useQuery<{ data: RosterShift[] }>({
    queryKey: rosterKey,
    queryFn: () => apiClient.get("/scheduling/weekly-roster", {
      params: { outletId: selectedOutletId, weekStartDate },
    }).then(r => r.data),
    enabled: !!selectedOutletId,
    staleTime: 0,
  });

  // Publish state: the schedule record carries the draft/published status + its id.
  const user = useAuthStore((s) => s.user);
  const scheduleKey = ["schedule-record", selectedOutletId, weekStartDate];
  const { data: scheduleRes } = useQuery<{ data: { id: string; status: string } | null }>({
    queryKey: scheduleKey,
    queryFn: () => apiClient.get("/scheduling/schedules", {
      params: { outletId: selectedOutletId, weekStartDate },
    }).then(r => r.data),
    enabled: !!selectedOutletId,
    staleTime: 0,
  });
  const scheduleId = scheduleRes?.data?.id ?? null;
  const isPublished = scheduleRes?.data?.status === "published";
  const canPublish = hasPermission(user, "schedule:publish");

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!scheduleId) throw new Error("No schedule to publish");
      await apiClient.post(`/scheduling/schedules/${scheduleId}/publish`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleKey });
      toast.success("Roster published — staff have been notified.");
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post("/scheduling/schedules/generate", {
        outletId: selectedOutletId,
        weekStartDate,
      });
      // Newer API echoes the roster back as { data: { generated, roster } }.
      const echoed = res.data?.data?.roster as RosterShift[] | undefined;
      if (Array.isArray(echoed) && echoed.length > 0) return echoed;
      // Older API build only returns a summary — fetch the freshly-committed
      // roster so the page renders regardless of which API version is running.
      return apiClient.get("/scheduling/weekly-roster", {
        params: { outletId: selectedOutletId, weekStartDate },
      }).then(r => (r.data?.data ?? []) as RosterShift[]);
    },
    onSuccess: (roster) => {
      // Push the generated roster straight into the cache — no timing race,
      // no fixed-delay refetch that could miss the commit and hang.
      queryClient.setQueryData(rosterKey, { data: roster });
      // Regenerating reverts the week to draft — refresh the publish badge/button.
      queryClient.invalidateQueries({ queryKey: scheduleKey });
      toast.success("Roster generated for this week.");
    },
  });

  // Reset stale generate state whenever the outlet or week changes, so an old
  // error/spinner never leaks into a different roster view.
  useEffect(() => {
    generateMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOutletId, weekStartDate]);

  const generateError = (generateMutation.error as { response?: { data?: { message?: string } } } | null)
    ?.response?.data?.message;

  /* ─── manual shift-time editor ─────────────────────────────────────────── */
  const { data: templatesRes } = useQuery<{ data: ShiftTemplate[] }>({
    queryKey: ["shift-templates", selectedOutletId],
    queryFn: () => apiClient.get("/scheduling/shift-templates", {
      params: { outletId: selectedOutletId },
    }).then(r => r.data),
    enabled: !!selectedOutletId,
  });
  const templates: ShiftTemplate[] = templatesRes?.data ?? [];

  const [showShiftEditor, setShowShiftEditor] = useState(false);
  const [shiftEdits, setShiftEdits] = useState<Record<string, { start: string; end: string }>>({});

  // Seed the editable inputs from the fetched templates.
  useEffect(() => {
    const init: Record<string, { start: string; end: string }> = {};
    for (const t of templatesRes?.data ?? []) {
      init[t.id] = { start: (t.start_time ?? "").slice(0, 5), end: (t.end_time ?? "").slice(0, 5) };
    }
    setShiftEdits(init);
  }, [templatesRes]);

  const saveShiftTimes = useMutation({
    mutationFn: async () => {
      const changed = templates.filter(t => {
        const e = shiftEdits[t.id];
        return e && (e.start !== (t.start_time ?? "").slice(0, 5) || e.end !== (t.end_time ?? "").slice(0, 5));
      });
      await Promise.all(changed.map(t =>
        apiClient.put(`/scheduling/shift-templates/${t.id}`, {
          startTime: shiftEdits[t.id].start,
          endTime: shiftEdits[t.id].end,
          fromWeekStartDate: weekStartDate,
        }),
      ));
      return changed.length;
    },
    onSuccess: (changedCount) => {
      queryClient.invalidateQueries({ queryKey: ["shift-templates", selectedOutletId] });
      queryClient.invalidateQueries({ queryKey: rosterKey });
      toast.success(changedCount === 1 ? "Shift time updated." : "Shift times updated.");
    },
  });

  const shiftTimesDirty = templates.some(t => {
    const e = shiftEdits[t.id];
    return e && (e.start !== (t.start_time ?? "").slice(0, 5) || e.end !== (t.end_time ?? "").slice(0, 5));
  });

  /* ─── manual per-staff shift move ──────────────────────────────────────── */
  const moveStaff = useMutation({
    mutationFn: async (vars: { staffId: string; templateId: string }) => {
      const res = await apiClient.post("/scheduling/assignments/move", {
        outletId: selectedOutletId,
        staffId: vars.staffId,
        templateId: vars.templateId,
        weekStartDate,
      });
      return res.data?.data?.roster as RosterShift[] | undefined;
    },
    onSuccess: (moved) => {
      // Push the returned roster straight into the cache for an instant update.
      if (Array.isArray(moved)) queryClient.setQueryData(rosterKey, { data: moved });
      toast.success("Staff moved to the new shift.");
    },
    // Reconcile with authoritative server state (guards against a stale cache if
    // two rows are moved in quick succession).
    onSettled: () => queryClient.invalidateQueries({ queryKey: rosterKey }),
  });
  const moveError = (moveStaff.error as { response?: { data?: { message?: string } } } | null)
    ?.response?.data?.message;

  // Manual shift pins — used to show a "return to rotation" affordance on pinned staff.
  const { data: overridesRes } = useQuery<{ data: { staffId: string; templateId: string }[] }>({
    queryKey: ["overrides", selectedOutletId],
    queryFn: () => apiClient.get("/scheduling/overrides", { params: { outletId: selectedOutletId } }).then(r => r.data),
    enabled: !!selectedOutletId,
  });
  const pinnedIds = new Set((overridesRes?.data ?? []).map(o => o.staffId));

  const unpinStaff = useMutation({
    mutationFn: (staffId: string) => apiClient.delete(`/scheduling/overrides/${staffId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overrides", selectedOutletId] });
      queryClient.invalidateQueries({ queryKey: rosterKey });
      toast.success("Returned to rotation — next week's roster places them normally.");
    },
  });

  const outlets = outletRes?.data ?? [];
  const roster  = rosterRes?.data ?? [];
  const selectedOutletName = outlets.find((o: { id: string; name: string }) => o.id === selectedOutletId)?.name ?? "";

  // Move-to targets = the shifts actually present in this week's roster (the
  // ground truth of what rotation scheduled), each matched back to its template
  // so we have the template_id the move endpoint needs. Deriving from the roster
  // rather than templates.slice(0,3) keeps the options — and each row's current
  // value — correct even if a manual start-time edit reorders the templates.
  const templateByKey = new Map(templates.map(t => [labelKey(t.name), t] as const));
  const rosterTemplates: ShiftTemplate[] = [];
  const seenTemplateIds = new Set<string>();
  for (const s of roster) {
    const t = templateByKey.get(labelKey(s.shiftName));
    if (t && !seenTemplateIds.has(t.id)) { seenTemplateIds.add(t.id); rosterTemplates.push(t); }
  }

  // Pick the first available day if filtering
  const displayDays = selectedDay ? weekDays.filter(d => format(d, "yyyy-MM-dd") === selectedDay) : weekDays;

  // Count staff on a given shift+day
  const staffCount = (shift: RosterShift, day: Date) =>
    shift.dates[format(day, "yyyy-MM-dd")]?.staff?.length ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">Weekly Shift Roster</h1>
            {selectedOutletId && scheduleId && (
              isPublished ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success px-2.5 py-1 text-xs font-semibold">
                  <CheckCircle2 size={13} /> Published
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 text-warning px-2.5 py-1 text-xs font-semibold">
                  Draft
                </span>
              )
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Auto-generated every Monday · Head Chef &amp; HOD can view all assignments
          </p>
        </div>
        {/* Info pill */}
        <div className="inline-flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold px-3 py-2 rounded-xl">
          <Info size={13} />
          Rotation runs automatically every Monday at midnight
        </div>
      </div>

      {/* Controls row — restaurant + dept filters + week nav all in one line */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Outlet picker */}
        <div className="relative shrink-0">
          <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <select value={selectedOutletId} onChange={e => { setSelectedOutletId(e.target.value); setExpandedShift(null); setDeptFilter(""); }}
            className="pl-8 pr-8 py-2.5 border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-card min-w-[200px]">
            <option value="">Select Restaurant…</option>
            {outlets.map((o: { id: string; name: string }) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>

        {/* Divider */}
        <div className="w-px h-7 bg-border shrink-0" />

        {/* Department filter buttons — right beside the dropdown */}
        {DEPARTMENTS.map(d => (
          <button key={d.value} onClick={() => setDeptFilter(d.value)}
            className={`text-xs font-semibold px-3 py-2.5 rounded-xl transition whitespace-nowrap ${
              deptFilter === d.value
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-card border border-border text-muted-foreground hover:bg-muted"
            }`}>
            {d.label}
          </button>
        ))}

        {/* Week nav pushed to the right */}
        <div className="flex items-center gap-1 ml-auto bg-card border border-border rounded-xl overflow-hidden shrink-0">
          <button onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
            className="px-3 py-2.5 hover:bg-muted transition">
            <ChevronLeft size={16} className="text-muted-foreground" />
          </button>
          <span className="text-sm font-semibold text-foreground px-3 whitespace-nowrap">
            {format(currentWeek, "d MMM")} – {format(weekDays[6], "d MMM yyyy")}
          </span>
          <button onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
            className="px-3 py-2.5 hover:bg-muted transition">
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Day filter tabs */}
      {selectedOutletId && (
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={() => setSelectedDay(null)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition ${!selectedDay ? "bg-foreground text-background" : "bg-card border border-border text-muted-foreground hover:bg-muted"}`}>
            All Days
          </button>
          {weekDays.map(d => (
            <button key={d.toISOString()} onClick={() => setSelectedDay(format(d, "yyyy-MM-dd"))}
              className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition ${selectedDay === format(d, "yyyy-MM-dd") ? "bg-blue-600 text-white" : "bg-card border border-border text-muted-foreground hover:bg-muted"}`}>
              {format(d, "EEE d")}
            </button>
          ))}
          {roster.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-card border border-border text-muted-foreground hover:bg-muted transition">
                <Printer size={12} /> Print
              </button>
              {canPublish && !isPublished && (
                <button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending || !scheduleId}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition">
                  <Send size={12} className={publishMutation.isPending ? "animate-pulse" : ""} />
                  {publishMutation.isPending ? "Publishing…" : "Publish week"}
                </button>
              )}
              <button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition">
                <RefreshCw size={12} className={generateMutation.isPending ? "animate-spin" : ""} />
                {generateMutation.isPending ? "Regenerating…" : "Regenerate"}
              </button>
            </div>
          )}
          {roster.length > 0 && generateMutation.isError && (
            <span className="text-xs text-red-500 w-full">
              {generateError ?? "Could not regenerate. Please try again."}
            </span>
          )}
        </div>
      )}

      {/* Per-staff move error (dropdown on each roster row) */}
      {moveStaff.isError && (
        <p className="text-xs text-red-500 -mt-2">
          {moveError ?? "Could not move staff to the new shift — please try again."}
        </p>
      )}

      {/* Manual shift-timing bar — override the auto-rotation start/end times */}
      {selectedOutletId && templates.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <button onClick={() => setShowShiftEditor(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted transition">
            <Clock size={15} className="text-indigo-600 shrink-0" />
            <span className="font-semibold text-sm text-foreground">Manual shift timings</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              — adjust each shift’s start/end for {selectedOutletName}
            </span>
            <ChevronDown size={16} className={`ml-auto text-muted-foreground transition-transform shrink-0 ${showShiftEditor ? "rotate-180" : ""}`} />
          </button>

          {showShiftEditor && (
            <div className="border-t border-border px-4 py-4 space-y-3">
              {templates.map(t => {
                const style = shiftStyle(t.name);
                const e = shiftEdits[t.id] ?? { start: "", end: "" };
                const overnight = e.end !== "" && e.start !== "" && e.end <= e.start;
                return (
                  <div key={t.id} className="flex items-center gap-3 flex-wrap">
                    <span className={`w-2.5 h-2.5 rounded-full ${style.badge} shrink-0`} />
                    <span className="font-semibold text-sm text-foreground min-w-[72px]">
                      {t.name.split("(")[0].trim()}
                    </span>
                    <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      Start
                      <input type="time" value={e.start}
                        onChange={ev => setShiftEdits(p => ({ ...p, [t.id]: { ...(p[t.id] ?? { start: "", end: "" }), start: ev.target.value } }))}
                        className="border border-border rounded-lg px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-indigo-500" />
                    </label>
                    <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      End
                      <input type="time" value={e.end}
                        onChange={ev => setShiftEdits(p => ({ ...p, [t.id]: { ...(p[t.id] ?? { start: "", end: "" }), end: ev.target.value } }))}
                        className="border border-border rounded-lg px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-indigo-500" />
                    </label>
                    {overnight && <span className="text-[11px] text-amber-600 font-semibold">overnight →</span>}
                  </div>
                );
              })}

              <div className="flex items-center gap-3 flex-wrap pt-1">
                <button onClick={() => saveShiftTimes.mutate()}
                  disabled={saveShiftTimes.isPending || !shiftTimesDirty}
                  className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition">
                  {saveShiftTimes.isPending ? "Saving…" : "Save shift times"}
                </button>
                <span className="text-xs text-muted-foreground">
                  Applies from {format(currentWeek, "d MMM")} onward · future auto-rotations use these times
                </span>
                {saveShiftTimes.isSuccess && !saveShiftTimes.isPending && !shiftTimesDirty && (
                  <span className="text-xs text-emerald-600 font-semibold">Saved ✓</span>
                )}
                {saveShiftTimes.isError && (
                  <span className="text-xs text-red-500">Could not save — please try again.</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!selectedOutletId ? (
        <div className="bg-card rounded-2xl border border-border p-16 text-center">
          <Building2 size={36} strokeWidth={1.2} className="text-muted-foreground/60 mx-auto mb-3" />
          <p className="font-semibold text-muted-foreground">Select a restaurant to view the shift roster</p>
          <p className="text-sm text-muted-foreground mt-1">Schedules are auto-generated every Monday</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="h-9 w-20 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-5 w-8" />
              </div>
              <div className="border-t border-border px-5 py-4 space-y-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-36" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : roster.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <Clock size={32} strokeWidth={1.2} className="text-muted-foreground/60 mx-auto mb-3" />
          <p className="font-semibold text-muted-foreground">No schedule yet for this week</p>
          <p className="text-sm text-muted-foreground mt-1 mb-6">
            No shifts have been generated for {selectedOutletName} · {format(currentWeek, "d MMM")} – {format(weekDays[6], "d MMM")}
          </p>
          {generateMutation.isError && (
            <p className="text-xs text-red-500 mb-3">
              {generateError ?? "Failed to generate. Please try again."}
            </p>
          )}
          {generateMutation.isPending ? (
            <div className="flex items-center justify-center gap-2 text-sm text-emerald-700 dark:text-emerald-300 font-semibold">
              <span className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              Generating shifts for {selectedOutletName}…
            </div>
          ) : (
            <button
              onClick={() => generateMutation.mutate()}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition">
              {generateMutation.isError ? "Try Again" : "Generate Schedule for This Week"}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile: day-first view (defaults to today · chips + swipe) */}
          <div className="md:hidden space-y-3" onTouchStart={swipeStart} onTouchEnd={swipeEnd}>
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {weekDays.map((d, i) => {
                const active = i === mobileDayIdx;
                return (
                  <button key={i} onClick={() => setMobileDayIdx(i)}
                    className={`flex min-h-[44px] shrink-0 flex-col items-center justify-center rounded-xl px-3 text-xs font-semibold transition ${active ? "bg-blue-600 text-white" : "bg-card border border-border text-muted-foreground"}`}>
                    <span>{format(d, "EEE")}</span>
                    <span className="text-sm font-black">{format(d, "d")}</span>
                  </button>
                );
              })}
            </div>
            {(() => {
              const dayKey = format(weekDays[mobileDayIdx], "yyyy-MM-dd");
              const dayShifts = roster
                .map(shift => ({
                  shift,
                  staff: (shift.dates[dayKey]?.staff ?? []).filter(s =>
                    !deptFilter || (s.departmentName ?? "").toLowerCase().includes(deptFilter.toLowerCase())),
                }))
                .filter(x => x.staff.length > 0);
              if (dayShifts.length === 0) {
                return (
                  <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                    No shifts on {format(weekDays[mobileDayIdx], "EEE d MMM")}.
                  </div>
                );
              }
              return dayShifts.map(({ shift, staff }) => {
                const { bg: shiftBg, badge } = shiftStyle(shift.shiftName);
                return (
                  <div key={shift.shiftName} className={`rounded-2xl border-l-4 border border-border overflow-hidden ${shiftBg}`}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className={`${badge} text-white text-xs font-black px-2.5 py-1 rounded-lg shrink-0`}>
                        {shift.startTime.slice(0, 5)}–{shift.isOvernight ? "00:00" : shift.endTime.slice(0, 5)}
                      </div>
                      <p className="flex-1 truncate text-sm font-bold text-foreground">{shift.shiftName.split("(")[0].trim()}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">{staff.length}</span>
                    </div>
                    <ul className="divide-y divide-black/5 border-t border-black/5">
                      {staff.map(s => (
                        <li key={s.staffId} className="flex items-center gap-2.5 px-4 py-2.5">
                          <div className={`w-8 h-8 rounded-full ${badge} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                            {s.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold leading-tight text-foreground">{s.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{s.positionName}{s.employeeId ? ` · ${s.employeeId}` : ""}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              });
            })()}
          </div>

          {/* Desktop: full week table (unchanged) */}
          <div className="hidden md:block space-y-4">
          {roster.map(shift => {
            const isExpanded = expandedShift === null || expandedShift === shift.shiftName;
            const { bg: shiftBg, badge } = shiftStyle(shift.shiftName);
            // Total unique staff across all days (they repeat, so pick from first day)
            const firstDayKey = Object.keys(shift.dates)[0];
            const allStaff    = firstDayKey ? shift.dates[firstDayKey].staff : [];
            const staffList   = deptFilter
              ? allStaff.filter(s => (s.departmentName ?? "").toLowerCase().includes(deptFilter.toLowerCase()))
              : allStaff;
            // The template this shift group maps to — the "current" value of each
            // row's Move-to dropdown.
            const currentTemplate = rosterTemplates.find(t => labelKey(t.name) === labelKey(shift.shiftName));

            return (
              <div key={shift.shiftName} className={`rounded-2xl border-l-4 border border-border overflow-hidden ${shiftBg}`}>
                {/* Shift header */}
                <button
                  onClick={() => setExpandedShift(isExpanded && expandedShift !== null ? null : shift.shiftName)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:brightness-95 transition">
                  <div className={`${badge} text-white text-xs font-black px-3 py-1.5 rounded-xl shrink-0 min-w-[80px] text-center`}>
                    {shift.startTime.slice(0, 5)} – {shift.isOvernight ? "00:00" : shift.endTime.slice(0, 5)}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-foreground">{shift.shiftName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {staffList.length} staff assigned · rotates weekly
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
                    <Users size={14} />
                    <span className="font-semibold">{staffList.length}</span>
                  </div>
                  <ChevronDown size={16} className={`text-muted-foreground transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
                </button>

                {/* Roster expanded */}
                {isExpanded && (
                  <div className="border-t border-black/5 px-5 py-4">
                    {/* Day columns */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="text-left pb-3 pr-4 text-xs font-bold text-muted-foreground uppercase tracking-wide w-48">Staff Member</th>
                            <th className="text-left pb-3 px-2 text-xs font-bold text-muted-foreground uppercase tracking-wide min-w-[110px]">Move to</th>
                            {displayDays.map(d => (
                              <th key={d.toISOString()} className="text-center pb-3 px-2 text-xs font-bold text-muted-foreground uppercase tracking-wide min-w-[80px]">
                                <div>{format(d, "EEE")}</div>
                                <div className="font-black text-foreground text-sm">{format(d, "d")}</div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {staffList.map(staff => (
                            <tr key={staff.staffId} className="hover:bg-black/5 transition">
                              <td className="py-2.5 pr-4">
                                <div className="flex items-center gap-2.5">
                                  <div className={`w-8 h-8 rounded-full ${badge} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                                    {staff.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-foreground leading-tight text-sm">{staff.name}</p>
                                    <p className="text-xs text-muted-foreground">{staff.positionName} · {staff.employeeId}</p>
                                  </div>
                                </div>
                              </td>
                              {/* Move-to shift dropdown — reassign this staff (this week onward) */}
                              <td className="py-2.5 px-2">
                                <div className="flex items-center gap-1.5">
                                {(() => {
                                  const isMoving = moveStaff.isPending && moveStaff.variables?.staffId === staff.staffId;
                                  return (
                                    <div className="relative inline-flex items-center">
                                      <select
                                        value={currentTemplate?.id ?? ""}
                                        disabled={isMoving || rosterTemplates.length === 0}
                                        onChange={ev => {
                                          const tid = ev.target.value;
                                          if (tid && tid !== currentTemplate?.id) moveStaff.mutate({ staffId: staff.staffId, templateId: tid });
                                        }}
                                        className="appearance-none bg-card border border-border rounded-lg pl-2.5 pr-7 py-1.5 text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 cursor-pointer">
                                        {!currentTemplate && <option value="">—</option>}
                                        {rosterTemplates.map(t => (
                                          <option key={t.id} value={t.id}>{t.name.split("(")[0].trim()}</option>
                                        ))}
                                      </select>
                                      {isMoving ? (
                                        <span className="absolute right-2 w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                      )}
                                    </div>
                                  );
                                })()}
                                {pinnedIds.has(staff.staffId) && (
                                  <button onClick={() => unpinStaff.mutate(staff.staffId)}
                                    disabled={unpinStaff.isPending && unpinStaff.variables === staff.staffId}
                                    title="Return to rotation"
                                    className="shrink-0 rounded-lg border border-border p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50">
                                    <RotateCcw size={12} />
                                  </button>
                                )}
                                </div>
                              </td>
                              {displayDays.map(d => {
                                const dateKey = format(d, "yyyy-MM-dd");
                                const assigned = shift.dates[dateKey]?.staff.some(s => s.staffId === staff.staffId);
                                return (
                                  <td key={d.toISOString()} className="text-center py-2.5 px-2">
                                    {assigned ? (
                                      <span className={`inline-block w-6 h-6 rounded-full ${badge} text-white text-xs font-bold leading-6`}>✓</span>
                                    ) : (
                                      <span className="text-muted-foreground/40">–</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Department breakdown */}
                    {(() => {
                      const byDept = staffList.reduce<Record<string, string[]>>((acc, s) => {
                        const d = s.departmentName || "General";
                        if (!acc[d]) acc[d] = [];
                        acc[d].push(s.name);
                        return acc;
                      }, {});
                      return (
                        <div className="mt-4 pt-4 border-t border-black/10 flex gap-3 flex-wrap">
                          {Object.entries(byDept).map(([dept, names]) => (
                            <div key={dept} className="bg-card/70 rounded-xl px-3 py-2 text-xs">
                              <p className="font-bold text-muted-foreground mb-1">{dept} ({names.length})</p>
                              <p className="text-muted-foreground">{names.join(", ")}</p>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </>
      )}

      {/* Print-only roster (A4 portrait, black-on-white; @media print in globals.css) */}
      {roster.length > 0 && (
        <div className="print-roster hidden print:block">
          <div style={{ color: "#000", background: "#fff", fontFamily: "sans-serif" }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Weekly Roster — {selectedOutletName}</h1>
            <p style={{ fontSize: 12, margin: "4px 0 12px" }}>
              Week {format(currentWeek, "d MMM")} – {format(weekDays[6], "d MMM yyyy")} · {isPublished ? "Published" : "Draft"} · Generated {format(new Date(), "d MMM yyyy, HH:mm")}
            </p>
            {roster.map(shift => {
              const firstDayKey = Object.keys(shift.dates)[0];
              const printStaff = firstDayKey ? shift.dates[firstDayKey].staff : [];
              return (
                <div key={shift.shiftName} style={{ marginBottom: 14, breakInside: "avoid" }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>
                    {shift.shiftName.split("(")[0].trim()} ({shift.startTime.slice(0, 5)}–{shift.isOvernight ? "00:00" : shift.endTime.slice(0, 5)})
                  </h2>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #000", padding: "2px 4px" }}>Staff</th>
                        {weekDays.map(d => (
                          <th key={d.toISOString()} style={{ borderBottom: "1px solid #000", padding: "2px 4px" }}>{format(d, "EEE d")}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {printStaff.map(s => (
                        <tr key={s.staffId}>
                          <td style={{ padding: "2px 4px", borderBottom: "1px solid #ccc" }}>{s.name}</td>
                          {weekDays.map(d => {
                            const assigned = shift.dates[format(d, "yyyy-MM-dd")]?.staff.some(x => x.staffId === s.staffId);
                            return (
                              <td key={d.toISOString()} style={{ textAlign: "center", padding: "2px 4px", borderBottom: "1px solid #ccc" }}>
                                {assigned ? "✓" : ""}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
