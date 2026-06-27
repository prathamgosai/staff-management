"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import Link from "next/link";
import {
  Search, Plus, Filter, Users, ChevronLeft, ChevronRight,
  X, ChevronDown, Loader2, Check, Trash2, AlertTriangle,
} from "lucide-react";

/* ─── types ──────────────────────────────────────────────────────────── */
interface StaffRow {
  id: string; name: string; phone: string;
  avatar_url?: string | null; avatarUrl?: string | null;
  employee_id?: string; employeeId?: string;
  employment_type?: string; employmentType?: string;
  employment_status?: string; employmentStatus?: string;
  outlet_name?: string; outletName?: string;
  position_name?: string; positionName?: string;
}
interface Outlet { id: string; name: string; code: string; }
interface Department { id: string; name: string; }
interface Position { id: string; name: string; level: number; }

/* ─── helpers ─────────────────────────────────────────────────────────── */
function f(row: StaffRow, s: keyof StaffRow, c: keyof StaffRow): string {
  return (row[c] as string) || (row[s] as string) || "";
}

const STATUS_CLS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  on_leave: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  probation: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  terminated: "bg-red-50 text-red-700 ring-1 ring-red-200",
};
const TYPE_CLS: Record<string, string> = {
  full_time: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  part_time: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  contract: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200",
  temporary: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
  intern: "bg-pink-50 text-pink-700 ring-1 ring-pink-200",
};
const AVATAR_COLORS = [
  "bg-blue-500","bg-violet-500","bg-emerald-500","bg-amber-500",
  "bg-rose-500","bg-indigo-500","bg-teal-500","bg-pink-500",
];
function avatarColor(name: string) {
  let h = 0; for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

/* ─── Select helper ───────────────────────────────────────────────────── */
function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-gray-600 mb-1">{children}</p>;
}
function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        {...props}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
      />
    </div>
  );
}
function Select({ label, children, ...props }: { label: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative">
        <select
          {...props}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white disabled:bg-gray-50 disabled:text-gray-400"
        >
          {children}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

/* ─── Add Staff Modal ─────────────────────────────────────────────────── */
function AddStaffModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const EMPTY_FORM = {
    name: "", phone: "", email: "", primaryOutletId: "",
    departmentId: "", positionId: "", employmentType: "full_time",
    joinDate: new Date().toISOString().slice(0, 10),
  };
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Reset form + errors each time the modal opens
  useEffect(() => {
    if (open) { setForm({ ...EMPTY_FORM, joinDate: new Date().toISOString().slice(0, 10) }); setErrors({}); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: outletData } = useQuery<{ data: Outlet[] }>({
    queryKey: ["outlets-list"],
    queryFn: () => apiClient.get("/outlets").then(r => r.data),
    enabled: open,
  });
  const { data: deptData, isFetching: deptLoading } = useQuery<{ data: Department[] }>({
    queryKey: ["departments", form.primaryOutletId],
    queryFn: () => apiClient.get("/departments", { params: { outletId: form.primaryOutletId } }).then(r => r.data),
    enabled: !!form.primaryOutletId,
  });
  const { data: posData } = useQuery<{ data: Position[] }>({
    queryKey: ["positions"],
    queryFn: () => apiClient.get("/departments/positions").then(r => r.data),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: (body: typeof form) => {
      // Strip empty optional strings so @IsEmail() / @IsOptional() validators pass
      const payload: Record<string, unknown> = {
        name: body.name.trim(),
        phone: body.phone.trim(),
        primaryOutletId: body.primaryOutletId,
        departmentId: body.departmentId,
        positionId: body.positionId,
        employmentType: body.employmentType,
        joinDate: body.joinDate,
      };
      if (body.email.trim()) payload.email = body.email.trim();
      return apiClient.post("/staff", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      onClose();
      setForm({ name:"",phone:"",email:"",primaryOutletId:"",departmentId:"",positionId:"",employmentType:"full_time",joinDate:new Date().toISOString().slice(0,10) });
      setErrors({});
    },
  });

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.phone.trim()) e.phone = "Phone is required";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      e.email = "Enter a valid email (e.g. name@gmail.com)";
    if (!form.primaryOutletId) e.primaryOutletId = "Select an outlet";
    if (!form.departmentId) e.departmentId = "Select a department";
    if (!form.positionId) e.positionId = "Select a position";
    if (!form.joinDate) e.joinDate = "Join date is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate(form);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Add Staff Member</h2>
            <p className="text-xs text-gray-500 mt-0.5">Fill in the details below to add a new staff member</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={submit} className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Input label="Full Name *" placeholder="e.g. Rahul Sharma" value={form.name}
                onChange={e => set("name", e.target.value)} />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>
            <div>
              <Input label="Phone *" placeholder="+91 98765 43210" value={form.phone}
                onChange={e => set("phone", e.target.value)} />
              {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
            </div>
            <div>
              <Input label="Email (optional)" type="email" placeholder="name@gmail.com"
                value={form.email} onChange={e => set("email", e.target.value)} />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
            </div>
          </div>

          <div>
            <Select label="Outlet *" value={form.primaryOutletId}
              onChange={e => { set("primaryOutletId", e.target.value); set("departmentId", ""); }}>
              <option value="">Select outlet…</option>
              {outletData?.data?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
            {errors.primaryOutletId && <p className="text-xs text-red-500 mt-1">{errors.primaryOutletId}</p>}
          </div>

          <div>
            <Select label="Department *" value={form.departmentId}
              onChange={e => set("departmentId", e.target.value)}
              disabled={!form.primaryOutletId || deptLoading}>
              <option value="">{deptLoading ? "Loading…" : !form.primaryOutletId ? "Select outlet first" : "Select department…"}</option>
              {deptData?.data?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            {errors.departmentId && <p className="text-xs text-red-500 mt-1">{errors.departmentId}</p>}
          </div>

          <div>
            <Select label="Position *" value={form.positionId} onChange={e => set("positionId", e.target.value)}>
              <option value="">Select position…</option>
              {posData?.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            {errors.positionId && <p className="text-xs text-red-500 mt-1">{errors.positionId}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Select label="Employment Type *" value={form.employmentType}
                onChange={e => set("employmentType", e.target.value)}>
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="temporary">Temporary</option>
                <option value="intern">Intern</option>
              </Select>
            </div>
            <div>
              <Input label="Join Date *" type="date" value={form.joinDate}
                onChange={e => set("joinDate", e.target.value)} />
              {errors.joinDate && <p className="text-xs text-red-500 mt-1">{errors.joinDate}</p>}
            </div>
          </div>

          {mutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {(() => {
                const err = mutation.error as { response?: { data?: { message?: string | string[] } } };
                const msgs = err?.response?.data?.message;
                const list = Array.isArray(msgs) ? msgs : msgs ? [msgs] : ["Failed to add staff. Please try again."];
                // Convert technical backend messages to friendly ones
                const friendly = list.map(m => {
                  if (m.includes("email")) return "Please enter a valid email address (e.g. name@gmail.com)";
                  if (m.includes("primaryOutletId")) return "Please select a valid outlet";
                  if (m.includes("positionId")) return "Please select a valid position";
                  if (m.includes("departmentId")) return "Please select a valid department";
                  return m;
                });
                return friendly.join(" · ");
              })()}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition">
            Cancel
          </button>
          <button onClick={submit} disabled={mutation.isPending}
            className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition">
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {mutation.isPending ? "Adding…" : "Add Staff"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Filter Drawer ───────────────────────────────────────────────────── */
function FilterDrawer({
  open, onClose, filters, onChange,
}: {
  open: boolean;
  onClose: () => void;
  filters: { outletId: string; status: string; employmentType: string };
  onChange: (f: typeof filters) => void;
}) {
  const { data: outletData } = useQuery<{ data: Outlet[] }>({
    queryKey: ["outlets-list"],
    queryFn: () => apiClient.get("/outlets").then(r => r.data),
    enabled: open,
  });
  const [local, setLocal] = useState(filters);
  const set = (k: string, v: string) => setLocal(f => ({ ...f, [k]: v }));

  useEffect(() => { if (open) setLocal(filters); }, [open, filters]);

  const activeCount = Object.values(filters).filter(Boolean).length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-80 h-full shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Filter Staff</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <Select label="Outlet" value={local.outletId} onChange={e => set("outletId", e.target.value)}>
            <option value="">All Outlets</option>
            {outletData?.data?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>

          <Select label="Status" value={local.status} onChange={e => set("status", e.target.value)}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="on_leave">On Leave</option>
            <option value="probation">Probation</option>
            <option value="inactive">Inactive</option>
          </Select>

          <Select label="Employment Type" value={local.employmentType} onChange={e => set("employmentType", e.target.value)}>
            <option value="">All Types</option>
            <option value="full_time">Full Time</option>
            <option value="part_time">Part Time</option>
            <option value="contract">Contract</option>
            <option value="temporary">Temporary</option>
            <option value="intern">Intern</option>
          </Select>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 space-y-2">
          <button onClick={() => { onChange(local); onClose(); }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg transition">
            Apply Filters
          </button>
          <button onClick={() => {
            const empty = { outletId: "", status: "", employmentType: "" };
            setLocal(empty); onChange(empty); onClose();
          }} className="w-full border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-lg hover:bg-gray-50 transition">
            Clear All
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────── */
export default function StaffPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState({ outletId: "", status: "", employmentType: "" });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const isAdmin = useAuthStore((s) => s.user?.role === "super_admin");
  const qc = useQueryClient();

  const params: Record<string, string | number> = { page, limit: 20 };
  if (search) params.search = search;
  if (filters.outletId) params.outletId = filters.outletId;
  if (filters.status) params.status = filters.status;
  if (filters.employmentType) params.employmentType = filters.employmentType;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/staff/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      setConfirmDeleteId(null);
    },
  });

  const { data, isLoading, isError } = useQuery<{ data: StaffRow[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>({
    queryKey: ["staff", params],
    queryFn: () => apiClient.get("/staff", { params }).then(r => r.data),
    staleTime: 30_000,
  });

  const total = data?.pagination?.total ?? 0;
  const totalPages = data?.pagination?.totalPages ?? 1;
  const activeFilters = Object.values(filters).filter(Boolean).length;

  return (
    <>
      <AddStaffModal open={showAdd} onClose={() => setShowAdd(false)} />
      <FilterDrawer open={showFilter} onClose={() => setShowFilter(false)}
        filters={filters} onChange={(f) => { setFilters(f); setPage(1); }} />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isLoading ? "Loading…" : `${total} members${activeFilters > 0 ? " (filtered)" : " across all outlets"}`}
            </p>
          </div>
          {isAdmin && (
            <button onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition shadow-sm">
              <Plus size={15} /> Add Staff
            </button>
          )}
        </div>

        {/* Search & filter */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name, employee ID, or phone…"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
          </div>
          <button onClick={() => setShowFilter(true)}
            className={`inline-flex items-center gap-2 border px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition ${
              activeFilters > 0
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}>
            <Filter size={15} />
            Filter
            {activeFilters > 0 && (
              <span className="ml-0.5 w-5 h-5 bg-blue-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {/* Active filter chips */}
        {activeFilters > 0 && (
          <div className="flex flex-wrap gap-2">
            {filters.outletId && (
              <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 text-xs px-3 py-1 rounded-full">
                Outlet filtered
                <button onClick={() => setFilters(f => ({ ...f, outletId: "" }))}><X size={11} /></button>
              </span>
            )}
            {filters.status && (
              <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 text-xs px-3 py-1 rounded-full">
                Status: {filters.status.replace(/_/g, " ")}
                <button onClick={() => setFilters(f => ({ ...f, status: "" }))}><X size={11} /></button>
              </span>
            )}
            {filters.employmentType && (
              <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 text-xs px-3 py-1 rounded-full">
                Type: {filters.employmentType.replace(/_/g, " ")}
                <button onClick={() => setFilters(f => ({ ...f, employmentType: "" }))}><X size={11} /></button>
              </span>
            )}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["Staff Member","Emp ID","Outlet","Position","Type","Status",""].map(h => (
                    <th key={h} className={`px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide ${h === "" ? "" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gray-200 shrink-0" />
                          <div className="space-y-1.5">
                            <div className="h-3.5 w-36 bg-gray-200 rounded" />
                            <div className="h-3 w-24 bg-gray-100 rounded" />
                          </div>
                        </div>
                      </td>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-4"><div className="h-3.5 bg-gray-100 rounded w-20" /></td>
                      ))}
                      <td className="px-4 py-4"><div className="h-3.5 bg-gray-100 rounded w-8 ml-auto" /></td>
                    </tr>
                  ))
                ) : isError ? (
                  <tr><td colSpan={7} className="text-center py-16">
                    <div className="flex flex-col items-center gap-2 text-red-500">
                      <span className="text-3xl">⚠️</span>
                      <p className="font-medium">Failed to load staff data</p>
                      <p className="text-xs text-gray-400">Make sure the API server is running</p>
                    </div>
                  </td></tr>
                ) : data?.data?.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <Users size={40} strokeWidth={1.2} />
                      <div>
                        <p className="font-medium text-gray-600">No staff found</p>
                        <p className="text-xs mt-0.5">
                          {activeFilters > 0 ? "Try clearing filters" : "Add your first staff member"}
                        </p>
                      </div>
                    </div>
                  </td></tr>
                ) : (
                  data?.data?.map(staff => {
                    const empId = f(staff, "employee_id", "employeeId");
                    const empType = f(staff, "employment_type", "employmentType");
                    const empStatus = f(staff, "employment_status", "employmentStatus");
                    const outlet = f(staff, "outlet_name", "outletName");
                    const position = f(staff, "position_name", "positionName");
                    return (
                      <tr key={staff.id} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            {staff.avatarUrl || staff.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={(staff.avatarUrl || staff.avatar_url) as string} alt={staff.name}
                                className="w-9 h-9 rounded-full object-cover shrink-0" />
                            ) : (
                              <div className={`w-9 h-9 rounded-full ${avatarColor(staff.name)} text-white flex items-center justify-center font-bold text-xs shrink-0`}>
                                {initials(staff.name)}
                              </div>
                            )}
                            <div>
                              <p className="font-semibold text-gray-900 leading-tight">{staff.name}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{staff.phone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{empId || "—"}</span>
                        </td>
                        <td className="px-4 py-4 text-xs font-medium text-gray-700">{outlet || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-4 text-xs text-gray-500">{position || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-4">
                          {empType
                            ? <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_CLS[empType] ?? "bg-gray-100 text-gray-600"}`}>{empType.replace(/_/g, " ")}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-4">
                          {empStatus
                            ? <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CLS[empStatus] ?? "bg-gray-100 text-gray-600"}`}>{empStatus.replace(/_/g, " ")}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {!isAdmin ? (
                            <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition">
                              <Link href={`/staff/${staff.id}`}
                                className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                                View →
                              </Link>
                            </div>
                          ) : confirmDeleteId === staff.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs text-red-600 font-medium whitespace-nowrap">Delete?</span>
                              <button
                                onClick={() => deleteMutation.mutate(staff.id)}
                                disabled={deleteMutation.isPending}
                                className="text-xs bg-red-600 hover:bg-red-700 text-white font-semibold px-2.5 py-1 rounded-lg transition disabled:opacity-50">
                                {deleteMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : "Yes"}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold px-2.5 py-1 rounded-lg transition">
                                No
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition">
                              <Link href={`/staff/${staff.id}`}
                                className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                                View →
                              </Link>
                              <button
                                onClick={() => setConfirmDeleteId(staff.id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500">
                Showing <span className="font-medium text-gray-700">{total === 0 ? 0 : (page-1)*20+1}–{Math.min(page*20, total)}</span>{" "}
                of <span className="font-medium text-gray-700">{total}</span>
              </p>
              <div className="flex items-center gap-1.5">
                <button disabled={page === 1} onClick={() => setPage(page - 1)}
                  className="p-1.5 rounded-lg border border-gray-200 bg-white disabled:opacity-40 hover:bg-gray-100 transition">
                  <ChevronLeft size={14} />
                </button>
                <span className="px-3 py-1 text-xs font-medium text-gray-700">{page} / {totalPages}</span>
                <button disabled={page === totalPages} onClick={() => setPage(page + 1)}
                  className="p-1.5 rounded-lg border border-gray-200 bg-white disabled:opacity-40 hover:bg-gray-100 transition">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
