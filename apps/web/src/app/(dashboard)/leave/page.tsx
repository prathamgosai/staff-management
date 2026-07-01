"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Plus, X, ChevronDown, Loader2, Check, Calendar, User } from "lucide-react";
import { format } from "date-fns";

/* ─── types ──────────────────────────────────────────────────────────── */
interface LeaveType   { id: string; name: string; type: string; }
interface StaffOption { id: string; name: string; employeeId?: string; outletName?: string; }
interface LeaveRequest {
  id: string; staff_name: string; employee_id: string;
  leave_type_name: string; start_date: string; end_date: string;
  total_days: number; applied_at: string; status: string; reason?: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200",
  approved:  "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200",
  rejected:  "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 ring-1 ring-red-200",
  cancelled: "bg-muted text-muted-foreground",
  withdrawn: "bg-muted text-muted-foreground",
};

/* ─── Apply Leave Modal ───────────────────────────────────────────────── */
function ApplyLeaveModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    staffId: "", leaveTypeId: "", startDate: "", endDate: "", reason: "",
  });
  const [errors, setErrors]         = useState<Record<string, string>>({});
  const [search, setSearch]         = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (open) {
      setForm({ staffId: "", leaveTypeId: "", startDate: "", endDate: "", reason: "" });
      setErrors({});
      setSearch("");
      setDropdownOpen(false);
    }
  }, [open]);

  const { data: leaveTypesRes } = useQuery<{ data: LeaveType[] }>({
    queryKey: ["leave-types"],
    queryFn: () => apiClient.get("/leave/types").then(r => r.data),
    enabled: open,
  });

  const { data: staffRes } = useQuery({
    queryKey: ["staff-search", search],
    queryFn: () => apiClient.get("/staff", { params: { search: search || undefined, limit: 50, page: 1 } }).then(r => r.data),
    enabled: open,
    staleTime: 30_000,
  });

  const leaveTypes = leaveTypesRes?.data ?? [];
  const staffList: Array<{ id: string; name: string; employee_id?: string; outlet_name?: string }> = staffRes?.data ?? [];

  const days = form.startDate && form.endDate
    ? Math.max(0, Math.round((new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) / 86400000) + 1)
    : 0;

  const mutation = useMutation({
    mutationFn: () => apiClient.post("/leave/requests", {
      staffId:     form.staffId,
      leaveTypeId: form.leaveTypeId,
      startDate:   form.startDate,
      endDate:     form.endDate,
      reason:      form.reason.trim() || undefined,
    }),
    onSuccess: () => {
      onClose();
      onSuccess();
    },
  });

  function validate() {
    const e: Record<string, string> = {};
    if (!form.staffId)     e.staffId     = "Select a staff member";
    if (!form.leaveTypeId) e.leaveTypeId = "Select leave type";
    if (!form.startDate)   e.startDate   = "Start date required";
    if (!form.endDate)     e.endDate     = "End date required";
    if (form.startDate && form.endDate && form.endDate < form.startDate)
      e.endDate = "End date must be after start date";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate();
  }

  if (!open) return null;

  const selectedStaff = staffList.find(s => s.id === form.staffId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-foreground">Apply for Leave</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Submit a leave request for a staff member</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="px-6 py-5 space-y-4">

          {/* Staff search */}
          <div className="relative">
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Staff Member *</label>

            {/* Selected badge OR search input */}
            {form.staffId && selectedStaff ? (
              <div className="flex items-center gap-2 border border-blue-300 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/15 rounded-lg px-3 py-2">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {selectedStaff.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-foreground flex-1">{selectedStaff.name}</span>
                <button type="button" onClick={() => { set("staffId", ""); setSearch(""); setDropdownOpen(true); }}
                  className="text-muted-foreground hover:text-muted-foreground">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Search by name or ID…"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setDropdownOpen(true); }}
                  onFocus={() => setDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                  className={`w-full border rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition ${errors.staffId ? "border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15" : "border-border"}`}
                />
              </div>
            )}

            {/* Dropdown */}
            {dropdownOpen && !form.staffId && (
              <div className="absolute z-10 left-0 right-0 border border-border rounded-xl mt-1 max-h-48 overflow-y-auto shadow-xl bg-card">
                {staffList.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-3 py-3">No staff found</p>
                ) : (
                  staffList
                    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.employee_id ?? "").toLowerCase().includes(search.toLowerCase()))
                    .map(s => (
                      <button key={s.id} type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { set("staffId", s.id); setSearch(""); setDropdownOpen(false); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-blue-50 text-sm flex items-center gap-3 border-b border-gray-50 last:border-0">
                        <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center shrink-0">
                          {s.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground leading-tight">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.employee_id}{s.outlet_name ? ` · ${s.outlet_name}` : ""}</p>
                        </div>
                      </button>
                    ))
                )}
              </div>
            )}
            {errors.staffId && <p className="text-xs text-red-500 mt-1">{errors.staffId}</p>}
          </div>

          {/* Leave type */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Leave Type *</label>
            <div className="relative">
              <select value={form.leaveTypeId} onChange={e => set("leaveTypeId", e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-card transition ${errors.leaveTypeId ? "border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15" : "border-border"}`}>
                <option value="">Select leave type…</option>
                {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
            {errors.leaveTypeId && <p className="text-xs text-red-500 mt-1">{errors.leaveTypeId}</p>}
          </div>

          {/* Date range — no icon overlay, just clean date inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Start Date *</label>
              <input type="date" value={form.startDate}
                onChange={e => {
                  set("startDate", e.target.value);
                  if (!form.endDate || form.endDate < e.target.value) set("endDate", e.target.value);
                }}
                className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition ${errors.startDate ? "border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15" : "border-border"}`} />
              {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">End Date *</label>
              <input type="date" value={form.endDate} min={form.startDate}
                onChange={e => set("endDate", e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition ${errors.endDate ? "border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15" : "border-border"}`} />
              {errors.endDate && <p className="text-xs text-red-500 mt-1">{errors.endDate}</p>}
            </div>
          </div>

          {/* Day count pill */}
          {days > 0 && (
            <div className="bg-blue-50 dark:bg-blue-500/15 rounded-xl px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-blue-600 font-medium">Total leave duration</span>
              <span className="text-sm font-bold text-blue-700 dark:text-blue-300">{days} day{days !== 1 ? "s" : ""}</span>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Reason <span className="font-normal text-muted-foreground">(optional)</span></label>
            <textarea value={form.reason} onChange={e => set("reason", e.target.value)}
              placeholder="Briefly describe the reason for leave…"
              rows={2}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none transition" />
          </div>

          {/* API error */}
          {mutation.isError && (
            <div className="bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {(mutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to submit leave request. Please try again."}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition">
            Cancel
          </button>
          <button onClick={submit} disabled={mutation.isPending}
            className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition">
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {mutation.isPending ? "Submitting…" : "Submit Leave"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────── */
export default function LeavePage() {
  const [showApply, setShowApply]         = useState(false);
  const [selectedOutletId, setSelectedOutletId] = useState("");
  const [statusFilter, setStatusFilter]   = useState("");
  const [reviewingId, setReviewingId]     = useState<string | null>(null);

  const { data: outlets } = useQuery({
    queryKey: ["outlets"],
    queryFn: () => apiClient.get("/outlets").then(r => r.data),
  });

  const { data: requests, isLoading, refetch: refetchLeave } = useQuery({
    queryKey: ["leave-requests", selectedOutletId, statusFilter],
    queryFn: () => apiClient.get("/leave/requests", {
      params: { outletId: selectedOutletId || undefined, status: statusFilter || undefined },
    }).then(r => r.data),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      apiClient.put(`/leave/requests/${id}/review`, { action }),
    onSuccess: () => {
      refetchLeave();
      setReviewingId(null);
    },
  });

  const rows: LeaveRequest[] = requests?.data ?? [];

  return (
    <>
      <ApplyLeaveModal open={showApply} onClose={() => setShowApply(false)} onSuccess={() => { refetchLeave(); }} />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Leave Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Review and approve leave requests</p>
          </div>
          <button onClick={() => setShowApply(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition shadow-sm">
            <Plus size={15} /> Apply Leave
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative">
            <select value={selectedOutletId} onChange={e => setSelectedOutletId(e.target.value)}
              className="border border-border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-card pr-8">
              <option value="">All Outlets</option>
              {outlets?.data?.map((o: { id: string; name: string }) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          <div className="relative">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="border border-border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-card pr-8">
              <option value="">All Requests</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          {rows.length > 0 && (
            <span className="flex items-center text-xs text-muted-foreground font-medium">{rows.length} request{rows.length !== 1 ? "s" : ""}</span>
          )}
        </div>

        {/* Table */}
        <div className="bg-card rounded-2xl border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Staff</th>
                <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Leave Type</th>
                <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Period</th>
                <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Days</th>
                <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Applied</th>
                <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-4 bg-muted rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Calendar size={32} strokeWidth={1.2} className="text-muted-foreground/60" />
                      <p className="font-medium text-muted-foreground">No leave requests found</p>
                      <p className="text-xs text-muted-foreground">Click "+ Apply Leave" to submit the first request</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map(r => (
                  <tr key={r.id} className="hover:bg-muted/60 transition">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-foreground leading-tight">{r.staff_name}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{r.employee_id}</p>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">{r.leave_type_name}</td>
                    <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                      {format(new Date(r.start_date), "d MMM")} – {format(new Date(r.end_date), "d MMM yyyy")}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="font-semibold text-foreground">{r.total_days}</span>
                      <span className="text-muted-foreground text-xs ml-1">day{Number(r.total_days) !== 1 ? "s" : ""}</span>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs whitespace-nowrap">{format(new Date(r.applied_at), "d MMM yyyy")}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[r.status] ?? "bg-muted text-muted-foreground"}`}>
                        {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {r.status === "pending" ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setReviewingId(r.id); reviewMutation.mutate({ id: r.id, action: "approve" }); }}
                            disabled={reviewMutation.isPending && reviewingId === r.id}
                            className="inline-flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg transition font-semibold whitespace-nowrap">
                            {reviewMutation.isPending && reviewingId === r.id ? "…" : "✓ Approve"}
                          </button>
                          <button
                            onClick={() => { setReviewingId(r.id); reviewMutation.mutate({ id: r.id, action: "reject" }); }}
                            disabled={reviewMutation.isPending && reviewingId === r.id}
                            className="inline-flex items-center gap-1 text-xs bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg transition font-semibold whitespace-nowrap">
                            ✕ Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
