"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  ChevronLeft, ChevronRight, Clock, Users, Building2,
  ChevronDown, Info,
} from "lucide-react";
import { format, addWeeks, subWeeks, startOfWeek } from "date-fns";

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

const SHIFT_BG: Record<string, string> = {
  "Shift A (12:00–21:00)": "border-l-blue-500 bg-blue-50",
  "Shift B (13:00–22:00)": "border-l-purple-500 bg-purple-50",
  "Shift C (15:00–00:00)": "border-l-amber-500 bg-amber-50",
};
const SHIFT_BADGE: Record<string, string> = {
  "Shift A (12:00–21:00)": "bg-blue-600",
  "Shift B (13:00–22:00)": "bg-purple-600",
  "Shift C (15:00–00:00)": "bg-amber-500",
};
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

  const weekStartDate = format(currentWeek, "yyyy-MM-dd");

  // 7 days of the week
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + i);
    return d;
  });

  const { data: outletRes } = useQuery({
    queryKey: ["outlets"],
    queryFn: () => apiClient.get("/outlets").then(r => r.data),
  });

  const { data: rosterRes, isLoading, refetch: refetchRoster } = useQuery<{ data: RosterShift[] }>({
    queryKey: ["weekly-roster", selectedOutletId, weekStartDate],
    queryFn: () => apiClient.get("/scheduling/weekly-roster", {
      params: { outletId: selectedOutletId, weekStartDate },
    }).then(r => r.data),
    enabled: !!selectedOutletId,
    staleTime: 0,
  });

  const generateMutation = useMutation({
    mutationFn: () => apiClient.post("/scheduling/schedules/generate", {
      outletId: selectedOutletId,
      weekStartDate,
    }),
    onSuccess: () => {
      // Small delay so the DB commit is visible before re-querying
      setTimeout(() => refetchRoster(), 600);
    },
  });

  const outlets = outletRes?.data ?? [];
  const roster  = rosterRes?.data ?? [];
  const selectedOutletName = outlets.find((o: { id: string; name: string }) => o.id === selectedOutletId)?.name ?? "";

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
          <h1 className="text-2xl font-bold text-gray-900">Weekly Shift Roster</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Auto-generated every Monday · Head Chef &amp; HOD can view all assignments
          </p>
        </div>
        {/* Info pill */}
        <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-2 rounded-xl">
          <Info size={13} />
          Rotation runs automatically every Monday at midnight
        </div>
      </div>

      {/* Controls row — restaurant + dept filters + week nav all in one line */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Outlet picker */}
        <div className="relative shrink-0">
          <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select value={selectedOutletId} onChange={e => { setSelectedOutletId(e.target.value); setExpandedShift(null); setDeptFilter(""); }}
            className="pl-8 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white min-w-[200px]">
            <option value="">Select Restaurant…</option>
            {outlets.map((o: { id: string; name: string }) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>

        {/* Divider */}
        <div className="w-px h-7 bg-gray-200 shrink-0" />

        {/* Department filter buttons — right beside the dropdown */}
        {DEPARTMENTS.map(d => (
          <button key={d.value} onClick={() => setDeptFilter(d.value)}
            className={`text-xs font-semibold px-3 py-2.5 rounded-xl transition whitespace-nowrap ${
              deptFilter === d.value
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}>
            {d.label}
          </button>
        ))}

        {/* Week nav pushed to the right */}
        <div className="flex items-center gap-1 ml-auto bg-white border border-gray-200 rounded-xl overflow-hidden shrink-0">
          <button onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
            className="px-3 py-2.5 hover:bg-gray-50 transition">
            <ChevronLeft size={16} className="text-gray-500" />
          </button>
          <span className="text-sm font-semibold text-gray-700 px-3 whitespace-nowrap">
            {format(currentWeek, "d MMM")} – {format(weekDays[6], "d MMM yyyy")}
          </span>
          <button onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
            className="px-3 py-2.5 hover:bg-gray-50 transition">
            <ChevronRight size={16} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Day filter tabs */}
      {selectedOutletId && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setSelectedDay(null)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition ${!selectedDay ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            All Days
          </button>
          {weekDays.map(d => (
            <button key={d.toISOString()} onClick={() => setSelectedDay(format(d, "yyyy-MM-dd"))}
              className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition ${selectedDay === format(d, "yyyy-MM-dd") ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              {format(d, "EEE d")}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!selectedOutletId ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
          <Building2 size={36} strokeWidth={1.2} className="text-gray-300 mx-auto mb-3" />
          <p className="font-semibold text-gray-500">Select a restaurant to view the shift roster</p>
          <p className="text-sm text-gray-400 mt-1">Schedules are auto-generated every Monday</p>
        </div>
      ) : isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading roster for {selectedOutletName}…</p>
        </div>
      ) : roster.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <Clock size={32} strokeWidth={1.2} className="text-gray-300 mx-auto mb-3" />
          <p className="font-semibold text-gray-600">No schedule yet for this week</p>
          <p className="text-sm text-gray-400 mt-1 mb-6">
            No shifts have been generated for {selectedOutletName} · {format(currentWeek, "d MMM")} – {format(weekDays[6], "d MMM")}
          </p>
          {generateMutation.isError && (
            <p className="text-xs text-red-500 mb-3">Failed to generate. Please try again.</p>
          )}
          {generateMutation.isPending || generateMutation.isSuccess ? (
            <div className="flex items-center justify-center gap-2 text-sm text-emerald-700 font-semibold">
              <span className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              {generateMutation.isPending ? "Generating shifts…" : "Generated! Loading roster…"}
            </div>
          ) : (
            <button
              onClick={() => generateMutation.mutate()}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition">
              Generate Schedule for This Week
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {roster.map(shift => {
            const isExpanded = expandedShift === null || expandedShift === shift.shiftName;
            const shiftBg = SHIFT_BG[shift.shiftName] ?? "border-l-gray-400 bg-gray-50";
            const badge   = SHIFT_BADGE[shift.shiftName] ?? "bg-gray-500";
            // Total unique staff across all days (they repeat, so pick from first day)
            const firstDayKey = Object.keys(shift.dates)[0];
            const allStaff    = firstDayKey ? shift.dates[firstDayKey].staff : [];
            const staffList   = deptFilter
              ? allStaff.filter(s => (s.departmentName ?? "").toLowerCase().includes(deptFilter.toLowerCase()))
              : allStaff;

            return (
              <div key={shift.shiftName} className={`rounded-2xl border-l-4 border border-gray-200 overflow-hidden ${shiftBg}`}>
                {/* Shift header */}
                <button
                  onClick={() => setExpandedShift(isExpanded && expandedShift !== null ? null : shift.shiftName)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:brightness-95 transition">
                  <div className={`${badge} text-white text-xs font-black px-3 py-1.5 rounded-xl shrink-0 min-w-[80px] text-center`}>
                    {shift.startTime.slice(0, 5)} – {shift.isOvernight ? "00:00" : shift.endTime.slice(0, 5)}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900">{shift.shiftName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {staffList.length} staff assigned · rotates weekly
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-500 shrink-0">
                    <Users size={14} />
                    <span className="font-semibold">{staffList.length}</span>
                  </div>
                  <ChevronDown size={16} className={`text-gray-400 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
                </button>

                {/* Roster expanded */}
                {isExpanded && (
                  <div className="border-t border-black/5 px-5 py-4">
                    {/* Day columns */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="text-left pb-3 pr-4 text-xs font-bold text-gray-500 uppercase tracking-wide w-48">Staff Member</th>
                            {displayDays.map(d => (
                              <th key={d.toISOString()} className="text-center pb-3 px-2 text-xs font-bold text-gray-500 uppercase tracking-wide min-w-[80px]">
                                <div>{format(d, "EEE")}</div>
                                <div className="font-black text-gray-700 text-sm">{format(d, "d")}</div>
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
                                    <p className="font-semibold text-gray-900 leading-tight text-sm">{staff.name}</p>
                                    <p className="text-xs text-gray-400">{staff.positionName} · {staff.employeeId}</p>
                                  </div>
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
                                      <span className="text-gray-200">–</span>
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
                            <div key={dept} className="bg-white/70 rounded-xl px-3 py-2 text-xs">
                              <p className="font-bold text-gray-600 mb-1">{dept} ({names.length})</p>
                              <p className="text-gray-500">{names.join(", ")}</p>
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
      )}
    </div>
  );
}
