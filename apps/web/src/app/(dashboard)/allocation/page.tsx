"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  ArrowLeftRight, Plus, X, ChevronDown, Users,
  MapPin, ArrowRight, Loader2,
} from "lucide-react";
import { format } from "date-fns";

/* ─── Types ────────────────────────────────────────────────────────────── */
interface OutletRow { id: string; name: string; address?: { city?: string }; brand_name?: string; }
interface StaffRow  { id: string; name: string; employeeId: string; positionName?: string; currentOutletId?: string; outletName?: string; }
type StaffWithOutlet = StaffRow & { _outletId: string; _outletName: string };
interface Transfer  {
  id: string; staff_name: string; employee_id: string;
  from_outlet_name: string; to_outlet_name: string;
  type: string; effective_date: string; status: string; reason?: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200",
  approved:  "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200",
  rejected:  "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 ring-1 ring-red-200",
  completed: "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-1 ring-blue-200",
};

const TRANSFER_TYPES = [
  { value: "temporary",  label: "Temporary" },
  { value: "permanent",  label: "Permanent" },
  { value: "secondment", label: "Secondment" },
];

/* ─── Request Transfer Modal ─────────────────────────────────────────── */
function RequestTransferModal({ open, onClose, onSuccess, outlets }: {
  open: boolean; onClose: () => void; onSuccess: () => void; outlets: OutletRow[];
}) {
  const [form, setForm] = useState({
    staffId: "", fromOutletId: "", toOutletId: "",
    type: "temporary", effectiveDate: "", endDate: "", reason: "",
  });
  const [search, setSearch]             = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffRow | null>(null);
  const [errors, setErrors]             = useState<Record<string, string>>({});
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (open) {
      setForm({ staffId: "", fromOutletId: "", toOutletId: "", type: "temporary", effectiveDate: "", endDate: "", reason: "" });
      setErrors({}); setSearch(""); setSelectedStaff(null);
    }
  }, [open]);

  const { data: staffRes } = useQuery({
    queryKey: ["staff-all", search],
    queryFn: () => apiClient.get("/staff", { params: { search: search || undefined, limit: 100 } }).then(r => r.data),
    enabled: open,
    staleTime: 30_000,
  });
  const staffList: StaffRow[] = staffRes?.data ?? [];

  function pickStaff(s: StaffRow) {
    setSelectedStaff(s);
    setForm(f => ({ ...f, staffId: s.id, fromOutletId: s.currentOutletId ?? "" }));
    setSearch("");
    setDropdownOpen(false);
  }

  function clearStaff() {
    setSelectedStaff(null);
    setForm(f => ({ ...f, staffId: "", fromOutletId: "" }));
    setSearch("");
    setDropdownOpen(true);
  }

  const mutation = useMutation({
    mutationFn: () => apiClient.post("/allocation/transfers", {
      staffId:       form.staffId,
      fromOutletId:  form.fromOutletId,
      toOutletId:    form.toOutletId,
      type:          form.type,
      effectiveDate: form.effectiveDate,
      endDate:       form.endDate || undefined,
      reason:        form.reason.trim() || undefined,
    }),
    onSuccess: () => { onClose(); onSuccess(); },
  });

  function validate() {
    const e: Record<string, string> = {};
    if (!form.staffId)       e.staffId       = "Select a staff member";
    if (!form.fromOutletId)  e.fromOutletId  = "Select from outlet";
    if (!form.toOutletId)    e.toOutletId    = "Select destination outlet";
    if (form.fromOutletId === form.toOutletId) e.toOutletId = "Destination must differ from current outlet";
    if (!form.effectiveDate) e.effectiveDate = "Effective date required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
          <div>
            <h2 className="text-lg font-bold text-foreground">Request Transfer</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Move staff between outlets</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Staff search */}
          <div className="relative">
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Staff Member <span className="text-red-500">*</span></label>
            {selectedStaff ? (
              <div className="flex items-center gap-2 border border-blue-300 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/15 rounded-xl px-3 py-2.5">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {selectedStaff.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">{selectedStaff.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedStaff.employeeId} · {selectedStaff.outletName}</p>
                </div>
                <button type="button" onClick={clearStaff}>
                  <X size={14} className="text-muted-foreground hover:text-muted-foreground" />
                </button>
              </div>
            ) : (
              <input type="text" autoComplete="off" placeholder="Search by name or ID…"
                value={search}
                onChange={e => { setSearch(e.target.value); setDropdownOpen(true); }}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition ${errors.staffId ? "border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15" : "border-border"}`}
              />
            )}
            {dropdownOpen && !selectedStaff && (
              <div className="absolute z-10 left-0 right-0 border border-border rounded-xl mt-1 max-h-48 overflow-y-auto shadow-xl bg-card">
                {staffList.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-3 py-3 text-center">No staff found</p>
                ) : staffList
                    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.employeeId.toLowerCase().includes(search.toLowerCase()))
                    .map(s => (
                      <button key={s.id} type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => pickStaff(s)}
                        className="w-full text-left px-3 py-2.5 hover:bg-blue-50 text-sm flex items-center gap-3 border-b border-gray-50 last:border-0">
                        <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center shrink-0">
                          {s.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground leading-tight">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.employeeId} · {s.outletName}</p>
                        </div>
                      </button>
                    ))
                }
              </div>
            )}
            {errors.staffId && <p className="text-xs text-red-500 mt-1">{errors.staffId}</p>}
          </div>

          {/* From / To outlets */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">From Outlet <span className="text-red-500">*</span></label>
              <select value={form.fromOutletId} onChange={e => set("fromOutletId", e.target.value)}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-card ${errors.fromOutletId ? "border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15" : "border-border"}`}>
                <option value="">Select…</option>
                {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {errors.fromOutletId && <p className="text-xs text-red-500 mt-1">{errors.fromOutletId}</p>}
            </div>
            <div className="pb-2 text-muted-foreground"><ArrowRight size={16} /></div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">To Outlet <span className="text-red-500">*</span></label>
              <select value={form.toOutletId} onChange={e => set("toOutletId", e.target.value)}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-card ${errors.toOutletId ? "border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15" : "border-border"}`}>
                <option value="">Select…</option>
                {outlets.filter(o => o.id !== form.fromOutletId).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {errors.toOutletId && <p className="text-xs text-red-500 mt-1">{errors.toOutletId}</p>}
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Transfer Type</label>
            <div className="flex gap-2">
              {TRANSFER_TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => set("type", t.value)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition ${
                    form.type === t.value ? "bg-blue-600 text-white border-blue-600" : "bg-card text-muted-foreground border-border hover:border-border"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Effective Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.effectiveDate} onChange={e => set("effectiveDate", e.target.value)}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${errors.effectiveDate ? "border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15" : "border-border"}`} />
              {errors.effectiveDate && <p className="text-xs text-red-500 mt-1">{errors.effectiveDate}</p>}
            </div>
            {form.type !== "permanent" && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">End Date <span className="text-muted-foreground">(optional)</span></label>
                <input type="date" value={form.endDate} min={form.effectiveDate} onChange={e => set("endDate", e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Reason <span className="text-muted-foreground">(optional)</span></label>
            <textarea value={form.reason} onChange={e => set("reason", e.target.value)}
              placeholder="Reason for transfer…" rows={2}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {mutation.isError && (
            <div className="bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {(mutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to submit transfer request."}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 border border-border text-muted-foreground font-semibold text-sm py-2.5 rounded-xl hover:bg-muted transition">Cancel</button>
          <button onClick={() => { if (validate()) mutation.mutate(); }} disabled={mutation.isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-2.5 rounded-xl transition disabled:opacity-60 flex items-center justify-center gap-2">
            {mutation.isPending ? <><Loader2 size={14} className="animate-spin" />Submitting…</> : "Submit Transfer"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── City Staff Panel ───────────────────────────────────────────────── */
function CityStaffPanel({ city, cityOutlets }: { city: string; cityOutlets: OutletRow[] }) {
  const [selectedOutletId, setSelectedOutletId] = useState<string | null>(null);

  const outletIds = cityOutlets.map(o => o.id);
  const queries = outletIds.map(id => ({
    key: ["staff-outlet", id],
    fn:  () => apiClient.get("/staff", { params: { outletId: id, limit: 500 } }).then(r => r.data),
  }));

  // Parallel fetch for all outlets in city
  const results = useQuery({
    queryKey: ["staff-city", city, ...outletIds],
    queryFn: async () => {
      const all = await Promise.all(queries.map(q => q.fn()));
      return all.flatMap((r, i) => (r.data ?? []).map((s: StaffRow) => ({ ...s, _outletId: outletIds[i], _outletName: cityOutlets[i].name })));
    },
    staleTime: 60_000,
  });

  const allStaff: StaffWithOutlet[] = results.data ?? [];
  const filtered = selectedOutletId ? allStaff.filter(s => s._outletId === selectedOutletId) : allStaff;

  return (
    <div className="bg-card rounded-2xl border border-border">
      {/* City header */}
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-blue-500" />
          <span className="font-bold text-foreground">{city}</span>
          <span className="text-xs text-muted-foreground">— {allStaff.length} staff across {cityOutlets.length} outlets</span>
        </div>
      </div>

      {/* Outlet filter chips */}
      <div className="px-5 py-3 flex gap-2 flex-wrap border-b border-gray-50">
        <button onClick={() => setSelectedOutletId(null)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition ${!selectedOutletId ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-border"}`}>
          All ({allStaff.length})
        </button>
        {cityOutlets.map(o => {
          const count = allStaff.filter(s => s._outletId === o.id).length;
          return (
            <button key={o.id} onClick={() => setSelectedOutletId(o.id === selectedOutletId ? null : o.id)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition ${selectedOutletId === o.id ? "bg-indigo-600 text-white" : "bg-muted text-muted-foreground hover:bg-border"}`}>
              {o.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Staff list */}
      <div className="divide-y divide-gray-50">
        {results.isLoading ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">Loading staff…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">No staff found</div>
        ) : (
          filtered.slice(0, 20).map(s => (
            <div key={s.id} className="px-5 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                {s.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight truncate">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.employeeId} · <span className="text-blue-600">{s._outletName}</span></p>
              </div>
              {s.positionName && <span className="text-xs text-muted-foreground shrink-0">{s.positionName}</span>}
            </div>
          ))
        )}
        {filtered.length > 20 && (
          <div className="px-5 py-2.5 text-xs text-muted-foreground text-center">+{filtered.length - 20} more staff</div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────── */
export default function AllocationPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal]       = useState(false);
  const [reviewingId, setReviewingId]   = useState<string | null>(null);

  const { data: outletsRes } = useQuery({
    queryKey: ["outlets"],
    queryFn: () => apiClient.get("/outlets").then(r => r.data),
  });
  const outlets: OutletRow[] = outletsRes?.data ?? [];

  // Group outlets by city
  const byCity = outlets.reduce<Record<string, OutletRow[]>>((acc, o) => {
    const city = o.address?.city ?? "Other";
    if (!acc[city]) acc[city] = [];
    acc[city].push(o);
    return acc;
  }, {});

  const { data: transfersRes, isLoading, refetch } = useQuery({
    queryKey: ["transfers", statusFilter],
    queryFn: () => apiClient.get("/allocation/transfers", { params: { status: statusFilter || undefined } }).then(r => r.data),
    staleTime: 0,
  });
  const transfers: Transfer[] = transfersRes?.data ?? [];

  const reviewMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      apiClient.put(`/allocation/transfers/${id}/review`, { action }),
    onSuccess: () => { refetch(); setReviewingId(null); },
  });

  return (
    <>
      <RequestTransferModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => refetch()}
        outlets={outlets}
      />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Staff Allocation & Transfers</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage cross-outlet staff transfers and temporary allocations</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-xl transition shadow-sm text-sm">
            <Plus size={15} /> Request Transfer
          </button>
        </div>

        {/* Staff by City ─ always visible */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users size={15} className="text-muted-foreground" />
            <h2 className="font-bold text-foreground text-base">Staff by City</h2>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {Object.entries(byCity).map(([city, cityOutlets]) => (
              <CityStaffPanel key={city} city={city} cityOutlets={cityOutlets} />
            ))}
          </div>
        </div>

        {/* Transfer Requests */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <ArrowLeftRight size={15} className="text-muted-foreground" />
              <h2 className="font-bold text-foreground text-base">Transfer Requests</h2>
              {transfers.length > 0 && <span className="text-xs text-muted-foreground">{transfers.length} total</span>}
            </div>
            <div className="relative">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="border border-border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-card pr-8 min-w-[140px]">
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="completed">Completed</option>
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="bg-muted border-b border-border">
                  <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Staff</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">From</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">To</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Type</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Effective</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                    ))}</tr>
                  ))
                ) : transfers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground">
                      <ArrowLeftRight size={28} className="mx-auto mb-2 opacity-20" />
                      <p className="font-medium text-muted-foreground">No transfer requests found</p>
                      <p className="text-xs mt-1">Click "+ Request Transfer" to create one</p>
                    </td>
                  </tr>
                ) : (
                  transfers.map(t => (
                    <tr key={t.id} className="hover:bg-muted/60 transition">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-foreground leading-tight">{t.staff_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{t.employee_id}</p>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground text-xs whitespace-nowrap">{t.from_outlet_name}</td>
                      <td className="px-5 py-3.5 font-medium text-blue-700 dark:text-blue-300 text-xs whitespace-nowrap">{t.to_outlet_name}</td>
                      <td className="px-5 py-3.5 text-muted-foreground capitalize text-xs whitespace-nowrap">{t.type.replace(/_/g, " ")}</td>
                      <td className="px-5 py-3.5 text-muted-foreground text-xs whitespace-nowrap">{format(new Date(t.effective_date), "d MMM yyyy")}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[t.status] ?? "bg-muted text-muted-foreground"}`}>
                          {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {t.status === "pending" ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setReviewingId(t.id); reviewMutation.mutate({ id: t.id, action: "approve" }); }}
                              disabled={reviewMutation.isPending && reviewingId === t.id}
                              className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg transition font-semibold whitespace-nowrap">
                              {reviewMutation.isPending && reviewingId === t.id ? "…" : "✓ Approve"}
                            </button>
                            <button
                              onClick={() => { setReviewingId(t.id); reviewMutation.mutate({ id: t.id, action: "reject" }); }}
                              disabled={reviewMutation.isPending && reviewingId === t.id}
                              className="text-xs bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg transition font-semibold whitespace-nowrap">
                              ✕ Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
