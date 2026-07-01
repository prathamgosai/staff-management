"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { format } from "date-fns";
import { Plus, X, Clock, CheckCircle2, AlertCircle, Search, ChevronDown } from "lucide-react";

interface AttendanceRecord {
  id: string; staff_name: string; employee_id: string;
  clock_in?: string; clock_out?: string;
  regular_hours: number; overtime_hours: number;
  late_minutes: number; status: string;
}
interface StaffRow { id: string; name: string; employeeId: string; }

const STATUS_OPTIONS = [
  { value: "present",        label: "Present" },
  { value: "late",           label: "Late" },
  { value: "absent",         label: "Absent" },
  { value: "on_leave",       label: "On Leave" },
  { value: "rest_day",       label: "Rest Day" },
  { value: "public_holiday", label: "Public Holiday" },
];

const STATUS_COLORS: Record<string, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  late: "bg-orange-100 text-orange-700",
  on_leave: "bg-blue-100 text-blue-700",
  rest_day: "bg-gray-100 text-gray-600",
  public_holiday: "bg-purple-100 text-purple-700",
};

const EMPTY_FORM = { staffId: "", clockIn: "", clockOut: "", status: "present", note: "" };

/* Searchable staff dropdown used by the Mark Attendance modal. */
function StaffPicker({ staff, value, onChange }: {
  staff: StaffRow[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Close when clicking outside the picker.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const selected = staff.find(s => s.id === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? staff.filter(s => s.name?.toLowerCase().includes(q) || (s.employeeId ?? "").toLowerCase().includes(q))
    : staff;

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white text-left outline-none focus:ring-2 focus:ring-blue-500">
        <span className={selected ? "text-gray-900 truncate" : "text-gray-400"}>
          {selected ? `${selected.name}${selected.employeeId ? ` · #${selected.employeeId}` : ""}` : "Select staff member…"}
        </span>
        <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search staff…"
                className="w-full pl-8 pr-2 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-gray-400">No staff found</p>
            ) : filtered.map(s => (
              <button key={s.id} type="button"
                onClick={() => { onChange(s.id); setOpen(false); setQuery(""); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between gap-2 ${s.id === value ? "bg-blue-50" : ""}`}>
                <span className="font-medium text-gray-800 truncate">{s.name}</span>
                {s.employeeId && <span className="text-xs text-gray-400 shrink-0">#{s.employeeId}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AttendancePage() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedOutletId, setSelectedOutletId] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const qc = useQueryClient();

  const { data: outlets } = useQuery({
    queryKey: ["outlets"],
    queryFn: () => apiClient.get("/outlets").then(r => r.data),
  });

  const { data: attendance, isLoading } = useQuery({
    queryKey: ["attendance", selectedOutletId, selectedDate],
    queryFn: () => apiClient.get("/attendance", {
      params: { outletId: selectedOutletId, date: selectedDate },
    }).then(r => r.data),
    enabled: !!selectedOutletId,
  });

  const { data: liveStatus } = useQuery({
    queryKey: ["attendance-live", selectedOutletId],
    queryFn: () => apiClient.get("/attendance/live-status", {
      params: { outletId: selectedOutletId },
    }).then(r => r.data),
    enabled: !!selectedOutletId && selectedDate === today,
    refetchInterval: 30000,
  });

  // Staff list for the selected outlet (for the modal dropdown)
  const { data: staffRes } = useQuery({
    queryKey: ["staff", selectedOutletId],
    queryFn: () => apiClient.get("/staff", {
      params: { outletId: selectedOutletId, limit: 500 },
    }).then(r => r.data),
    enabled: !!selectedOutletId && showModal,
  });
  const staffList: StaffRow[] = staffRes?.data ?? [];

  const markMutation = useMutation({
    mutationFn: () => apiClient.post("/attendance/manual-entry", {
      staffId: form.staffId,
      outletId: selectedOutletId,
      date: selectedDate,
      clockIn: `${selectedDate}T${form.clockIn}:00`,
      clockOut: form.clockOut ? `${selectedDate}T${form.clockOut}:00` : undefined,
      status: form.status,
      note: form.note || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance", selectedOutletId, selectedDate] });
      qc.invalidateQueries({ queryKey: ["attendance-live", selectedOutletId] });
      setShowModal(false);
      setForm(EMPTY_FORM);
      setFormError("");
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      setFormError(e.response?.data?.message ?? "Failed to save attendance.");
    },
  });

  function handleSubmit() {
    setFormError("");
    if (!form.staffId) return setFormError("Please select a staff member.");
    if (!form.clockIn) return setFormError("Clock-in time is required.");
    if (form.clockOut && form.clockOut <= form.clockIn) return setFormError("Clock-out must be after clock-in.");
    markMutation.mutate();
  }

  const outletName = outlets?.data?.find((o: { id: string; name: string }) => o.id === selectedOutletId)?.name ?? "";

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-gray-500 text-sm mt-1">Daily attendance tracking and correction management</p>
        </div>
        {selectedOutletId && (
          <button
            onClick={() => { setShowModal(true); setFormError(""); setForm(EMPTY_FORM); }}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition">
            <Plus size={16} />
            Mark Attendance
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <select
          value={selectedOutletId}
          onChange={e => setSelectedOutletId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]">
          <option value="">Select Outlet</option>
          {outlets?.data?.map((o: { id: string; name: string }) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Live status banner */}
      {selectedDate === today && liveStatus?.data?.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5">
          <p className="text-sm font-medium text-green-800 mb-2 flex items-center gap-1.5">
            <CheckCircle2 size={14} /> Currently Clocked In ({liveStatus.data.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {liveStatus.data.map((s: { staff_id: string; name: string; clock_in: string }) => (
              <span key={s.staff_id} className="bg-white border border-green-200 text-green-800 text-xs px-2.5 py-1 rounded-full">
                {s.name} · {format(new Date(s.clock_in), "HH:mm")}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-700">Staff</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Clock In</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Clock Out</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Regular Hrs</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">OT Hrs</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Late (min)</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!selectedOutletId ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">Select an outlet to view attendance</td></tr>
            ) : isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                  <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                ))}</tr>
              ))
            ) : attendance?.data?.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-14 text-center">
                  <Clock size={32} strokeWidth={1.2} className="text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No attendance records for this date</p>
                  <p className="text-gray-400 text-xs mt-1">Use the "Mark Attendance" button above to add records manually</p>
                </td>
              </tr>
            ) : (
              attendance?.data?.map((r: AttendanceRecord) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {r.staff_name}
                    <span className="text-xs text-gray-400 ml-1">#{r.employee_id}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.clock_in ? format(new Date(r.clock_in), "HH:mm") : "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{r.clock_out ? format(new Date(r.clock_out), "HH:mm") : "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{r.regular_hours ? `${r.regular_hours}h` : "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{r.overtime_hours > 0 ? `${r.overtime_hours}h` : "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{r.late_minutes > 0 ? r.late_minutes : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mark Attendance Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Mark Attendance</h2>
                <p className="text-xs text-gray-400 mt-0.5">{outletName} · {format(new Date(selectedDate + "T00:00:00"), "d MMM yyyy")}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition">
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              {/* Staff */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1.5">Staff Member <span className="text-red-500">*</span></label>
                <StaffPicker
                  staff={staffList}
                  value={form.staffId}
                  onChange={id => setForm(f => ({ ...f, staffId: id }))}
                />
              </div>

              {/* Status */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1.5">Status <span className="text-red-500">*</span></label>
                <div className="flex gap-2 flex-wrap">
                  {STATUS_OPTIONS.map(s => (
                    <button key={s.value} type="button"
                      onClick={() => setForm(f => ({ ...f, status: s.value }))}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition ${
                        form.status === s.value
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                      }`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Times */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1.5">Clock In <span className="text-red-500">*</span></label>
                  <input type="time" value={form.clockIn}
                    onChange={e => setForm(f => ({ ...f, clockIn: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1.5">Clock Out <span className="text-gray-400">(optional)</span></label>
                  <input type="time" value={form.clockOut}
                    onChange={e => setForm(f => ({ ...f, clockOut: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1.5">Note <span className="text-gray-400">(optional)</span></label>
                <input type="text" placeholder="e.g. Manually added by manager"
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Error */}
              {formError && (
                <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-3 py-2.5 rounded-xl border border-red-200">
                  <AlertCircle size={14} className="shrink-0" />
                  {formError}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 font-semibold text-sm py-2.5 rounded-xl hover:bg-gray-50 transition">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={markMutation.isPending}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-2.5 rounded-xl transition disabled:opacity-60 flex items-center justify-center gap-2">
                {markMutation.isPending
                  ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                  : "Save Attendance"
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
