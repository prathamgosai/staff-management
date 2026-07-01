"use client";

import { useState } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import Link from "next/link";
import {
  Building2, Users, MapPin, Plus, X, ChevronDown,
  Loader2, Check, Coffee, Utensils, ShoppingBag, Truck, Wine,
  MoreHorizontal, ArrowUpRight, ChevronRight, Trash2,
} from "lucide-react";

/* ─── constants ───────────────────────────────────────────────────────── */
// Sentinel value for the "add a new brand" option in the Brand dropdown.
const NEW_BRAND = "__new__";

/* ─── types ──────────────────────────────────────────────────────────── */
interface Brand { id: string; name: string; }
interface OutletRow {
  id: string; code: string; name: string; type: string;
  brand_name?: string; brandName?: string;
  address: { city?: string; state?: string; };
  active_staff_count?: number; activeStaffCount?: number;
  is_active?: boolean; isActive?: boolean;
}
interface StaffRow {
  id: string; name: string; phone?: string;
  employee_id?: string; employeeId?: string;
  employment_type?: string; employmentType?: string;
  employment_status?: string; employmentStatus?: string;
  position_name?: string; positionName?: string;
  department_name?: string; departmentName?: string;
  outletLabel?: string;
}

const OUTLET_TYPES = [
  { value: "dine_in",       label: "Dine In",        icon: Utensils },
  { value: "quick_service", label: "Quick Service",   icon: ShoppingBag },
  { value: "cafe",          label: "Café",            icon: Coffee },
  { value: "cloud_kitchen", label: "Cloud Kitchen",   icon: Truck },
  { value: "bar",           label: "Bar",             icon: Wine },
  { value: "other",         label: "Other",           icon: MoreHorizontal },
] as const;

const TYPE_COLORS: Record<string, string> = {
  dine_in:       "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  quick_service: "bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300",
  cafe:          "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  cloud_kitchen: "bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300",
  bar:           "bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300",
  other:         "bg-muted text-muted-foreground",
};
const TYPE_ICON_COLORS: Record<string, string> = {
  dine_in:       "bg-blue-100 dark:bg-blue-500/20 text-blue-600",
  quick_service: "bg-orange-100 dark:bg-orange-500/20 text-orange-600",
  cafe:          "bg-amber-100 dark:bg-amber-500/20 text-amber-600",
  cloud_kitchen: "bg-violet-100 dark:bg-violet-500/20 text-violet-600",
  bar:           "bg-rose-100 dark:bg-rose-500/20 text-rose-600",
  other:         "bg-muted text-muted-foreground",
};
const STATUS_CLS: Record<string, string> = {
  active:    "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  on_leave:  "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  probation: "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
};
const TYPE_CLS: Record<string, string> = {
  full_time: "bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300",
  part_time: "bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300",
  contract:  "bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
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
function fv(row: StaffRow, s: keyof StaffRow, c: keyof StaffRow): string {
  return (row[c] as string) || (row[s] as string) || "";
}

/* ─── helpers ─────────────────────────────────────────────────────────── */
function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-muted-foreground mb-1">{children}</p>;
}
function FInput({ label, error, ...props }: { label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <Label>{label}</Label>
      <input {...props}
        className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition ${error ? "border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15" : "border-border"}`} />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
function FSelect({ label, error, children, ...props }: { label: string; error?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative">
        <select {...props}
          className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-card transition ${error ? "border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15" : "border-border"}`}>
          {children}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

/* ─── Add Outlet Modal ────────────────────────────────────────────────── */
function AddOutletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    brandId: "", newBrandName: "", code: "", name: "", type: "dine_in",
    city: "", state: "", phone: "", email: "", seatingCapacity: "",
  });
  const addingNewBrand = form.brandId === NEW_BRAND;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const { data: brandData } = useQuery<{ data: Brand[] }>({
    queryKey: ["brands"],
    queryFn: () => apiClient.get("/outlets/brands").then(r => r.data),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: (body: typeof form) => {
      const isNew = body.brandId === NEW_BRAND;
      return apiClient.post("/outlets", {
        // Send a real brandId, or a typed-in brandName for a brand-new brand.
        brandId: isNew ? undefined : body.brandId,
        brandName: isNew ? body.newBrandName.trim() : undefined,
        code: body.code.toUpperCase(),
        name: body.name,
        type: body.type,
        address: { city: body.city, state: body.state, country: "IN" },
        contact: { phone: body.phone || undefined, email: body.email || undefined },
        seatingCapacity: body.seatingCapacity ? parseInt(body.seatingCapacity) : undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outlets"] });
      qc.invalidateQueries({ queryKey: ["brands"] });
      onClose();
      setForm({ brandId:"",newBrandName:"",code:"",name:"",type:"dine_in",city:"",state:"",phone:"",email:"",seatingCapacity:"" });
      setErrors({});
    },
  });

  function validate() {
    const e: Record<string, string> = {};
    if (!form.brandId) e.brandId = "Select a brand";
    else if (form.brandId === NEW_BRAND && !form.newBrandName.trim()) e.newBrandName = "Enter the new brand name";
    if (!form.code.trim()) e.code = "Outlet code is required";
    else if (!/^[A-Za-z0-9-]+$/.test(form.code)) e.code = "Only letters, numbers, and hyphens";
    if (!form.name.trim()) e.name = "Outlet name is required";
    if (!form.city.trim()) e.city = "City is required";
    if (!form.state.trim()) e.state = "State is required";
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
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-foreground">Add New Outlet</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Set up a new restaurant outlet or kitchen</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <form onSubmit={submit} className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
          <div>
            <Label>Outlet Type *</Label>
            <div className="grid grid-cols-3 gap-2">
              {OUTLET_TYPES.map(({ value, label, icon: Icon }) => (
                <button key={value} type="button" onClick={() => set("type", value)}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-xs font-medium transition ${
                    form.type === value ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300" : "border-border text-muted-foreground hover:border-border"
                  }`}>
                  <Icon size={18} />{label}
                </button>
              ))}
            </div>
          </div>
          <FSelect label="Brand *" value={form.brandId} onChange={e => set("brandId", e.target.value)} error={errors.brandId}>
            <option value="">Select brand…</option>
            {brandData?.data?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            <option value={NEW_BRAND}>＋ Add a new brand…</option>
          </FSelect>
          {addingNewBrand && (
            <FInput label="New Brand Name *" placeholder="e.g. Spice Route" value={form.newBrandName}
              onChange={e => set("newBrandName", e.target.value)} error={errors.newBrandName} autoFocus maxLength={60} />
          )}
          <div className="grid grid-cols-2 gap-4">
            <FInput label="Outlet Code *" placeholder="e.g. CAP-PIL" value={form.code}
              onChange={e => set("code", e.target.value.toUpperCase())} error={errors.code} maxLength={12} />
            <FInput label="Outlet Name *" placeholder="e.g. Capiche Piplod" value={form.name}
              onChange={e => set("name", e.target.value)} error={errors.name} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FInput label="City *" placeholder="e.g. Surat" value={form.city}
              onChange={e => set("city", e.target.value)} error={errors.city} />
            <FInput label="State *" placeholder="e.g. Gujarat" value={form.state}
              onChange={e => set("state", e.target.value)} error={errors.state} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FInput label="Contact Phone" type="tel" placeholder="+91 98765 43210"
              value={form.phone} onChange={e => set("phone", e.target.value)} />
            <FInput label="Contact Email" type="email" placeholder="outlet@company.com"
              value={form.email} onChange={e => set("email", e.target.value)} />
          </div>
          <FInput label="Seating Capacity (optional)" type="number" placeholder="e.g. 80"
            value={form.seatingCapacity} onChange={e => set("seatingCapacity", e.target.value)} min="0" max="9999" />
          {mutation.isError && (
            <div className="bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
              Failed to create outlet. Please check the details and try again.
            </div>
          )}
        </form>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition">Cancel</button>
          <button onClick={submit} disabled={mutation.isPending}
            className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition">
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {mutation.isPending ? "Creating…" : "Create Outlet"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Shared staff list renderer ──────────────────────────────────────── */
function StaffList({ staff, activeDept, showOutletLabel = false }: {
  staff: StaffRow[];
  activeDept: string;
  showOutletLabel?: boolean;
}) {
  const filtered = activeDept === "All"
    ? staff
    : staff.filter(s => (fv(s, "department_name", "departmentName") || "Unassigned") === activeDept);

  if (filtered.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-5">No staff in this department</p>;
  }
  return (
    <div className="bg-muted rounded-xl overflow-hidden divide-y divide-border">
      {filtered.map(s => {
        const empId     = fv(s, "employee_id", "employeeId");
        const empType   = fv(s, "employment_type", "employmentType");
        const empStatus = fv(s, "employment_status", "employmentStatus");
        const position  = fv(s, "position_name", "positionName");
        return (
          <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className={`w-9 h-9 rounded-full ${avatarColor(s.name)} text-white flex items-center justify-center text-xs font-bold shrink-0`}>
              {initials(s.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate leading-tight">{s.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {position || "—"}
                {showOutletLabel && s.outletLabel && (
                  <span className="ml-1.5 text-blue-500 font-medium">· {s.outletLabel}</span>
                )}
              </p>
            </div>
            <span className="font-mono text-xs text-muted-foreground shrink-0 hidden sm:block">{empId || "—"}</span>
            {empType && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 hidden md:block ${TYPE_CLS[empType] ?? "bg-muted text-muted-foreground"}`}>
                {empType.replace(/_/g, " ")}
              </span>
            )}
            {empStatus && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_CLS[empStatus] ?? "bg-muted text-muted-foreground"}`}>
                {empStatus.replace(/_/g, " ")}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Dept filter chips ───────────────────────────────────────────────── */
function DeptChips({ staff, activeDept, onChange }: {
  staff: StaffRow[]; activeDept: string; onChange: (d: string) => void;
}) {
  const depts = ["All", ...Array.from(new Set(
    staff.map(s => fv(s, "department_name", "departmentName") || "Unassigned")
  )).sort()];
  return (
    <div className="flex gap-2 flex-wrap mb-3">
      {depts.map(d => {
        const count = d === "All"
          ? staff.length
          : staff.filter(s => (fv(s, "department_name", "departmentName") || "Unassigned") === d).length;
        return (
          <button key={d} onClick={() => onChange(d)}
            className={`text-xs font-semibold px-3 py-1 rounded-full transition ${
              activeDept === d ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-border"
            }`}>
            {d} <span className="opacity-70">({count})</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Staff Panel — per outlet ────────────────────────────────────────── */
function StaffPanel({ outletId, outletCode }: { outletId: string; outletCode: string }) {
  const [activeDept, setActiveDept] = useState("All");

  const { data, isLoading } = useQuery<{ data: StaffRow[] }>({
    queryKey: ["staff-outlet", outletId],
    queryFn: () => apiClient.get("/staff", { params: { outletId, limit: 300, page: 1 } }).then(r => r.data),
    staleTime: 60_000,
  });

  const staff = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="px-5 pb-5 pt-3 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="w-9 h-9 rounded-full bg-border shrink-0" />
            <div className="flex-1 h-3 bg-border rounded" />
            <div className="w-20 h-3 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (staff.length === 0) {
    return (
      <div className="px-5 pb-5 pt-3 text-center text-sm text-muted-foreground">
        No staff assigned to this outlet
      </div>
    );
  }

  return (
    <div className="px-5 pb-5 pt-3">
      <DeptChips staff={staff} activeDept={activeDept} onChange={setActiveDept} />
      <StaffList staff={staff} activeDept={activeDept} />
      <Link href={`/outlets/${outletId}`}
        className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium">
        View full details <ArrowUpRight size={12} />
      </Link>
    </div>
  );
}

/* ─── City Staff Panel — all outlets in a city ────────────────────────── */
function CityStaffPanel({ outlets }: { outlets: OutletRow[] }) {
  const [activeDept, setActiveDept] = useState("All");

  const results = useQueries({
    queries: outlets.map(o => ({
      queryKey: ["staff-outlet", o.id],
      queryFn: () => apiClient.get("/staff", { params: { outletId: o.id, limit: 300, page: 1 } })
        .then(r => r.data as { data: StaffRow[] }),
      staleTime: 60_000,
    })),
  });

  const isLoading = results.some(r => r.isLoading);

  const allStaff: StaffRow[] = results.flatMap((r, i) =>
    (r.data?.data ?? []).map(s => ({ ...s, outletLabel: outlets[i]?.name ?? "" }))
  );

  if (isLoading) {
    return (
      <div className="px-5 pb-5 pt-3 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-500/20 shrink-0" />
            <div className="flex-1 h-3 bg-border rounded" />
            <div className="w-24 h-3 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (allStaff.length === 0) {
    return <div className="px-5 pb-4 text-center text-sm text-muted-foreground">No staff found in this city</div>;
  }

  return (
    <div className="px-5 pb-5 pt-3">
      {/* Per-outlet breakdown */}
      <div className="flex gap-2 flex-wrap mb-3">
        {outlets.map((o, i) => {
          const count = results[i]?.data?.data?.length ?? 0;
          return (
            <span key={o.id} className="inline-flex items-center gap-1 text-xs bg-card border border-border text-muted-foreground font-medium px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
              {o.name} <span className="text-muted-foreground">({count})</span>
            </span>
          );
        })}
      </div>

      <DeptChips staff={allStaff} activeDept={activeDept} onChange={setActiveDept} />
      <StaffList staff={allStaff} activeDept={activeDept} showOutletLabel />
    </div>
  );
}

/* ─── Outlet Accordion Row ────────────────────────────────────────────── */
function OutletAccordion({ outlet, expanded, onToggle, onDelete }: {
  outlet: OutletRow; expanded: boolean; onToggle: () => void; onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/outlets/${outlet.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outlets"] });
      onDelete();
    },
  });

  const isActive  = outlet.is_active ?? outlet.isActive ?? true;
  const brandName = outlet.brand_name ?? outlet.brandName ?? "";
  const staffCount= Number(outlet.active_staff_count ?? outlet.activeStaffCount ?? 0);
  const typeEntry = OUTLET_TYPES.find(t => t.value === outlet.type);
  const Icon      = typeEntry?.icon ?? Building2;
  const iconCls   = TYPE_ICON_COLORS[outlet.type] ?? "bg-muted text-muted-foreground";
  const typeCls   = TYPE_COLORS[outlet.type] ?? "bg-muted text-muted-foreground";
  const typeLabel = typeEntry?.label ?? outlet.type;

  return (
    <div className={`bg-card rounded-2xl border transition-all ${expanded ? "border-blue-300 dark:border-blue-500/30 shadow-md" : "border-border hover:border-border"}`}>
      <div className="px-5 py-4 flex items-center gap-4">
        {/* Clickable area */}
        <button onClick={onToggle} className="flex items-center gap-4 flex-1 min-w-0 text-left">
          <div className={`${iconCls} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}>
            <Icon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-foreground text-sm leading-tight">{outlet.name}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeCls}`}>{typeLabel}</span>
              {isActive
                ? <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Active</span>
                : <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">Inactive</span>
              }
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {brandName} · <span className="font-mono">{outlet.code}</span>
              {outlet.address?.city && <> · <MapPin size={10} className="inline mr-0.5" />{outlet.address.city}</>}
            </p>
          </div>
        </button>

        {/* Staff count */}
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users size={13} />
            <span className="text-sm font-semibold text-foreground">{staffCount}</span>
          </div>
          <p className="text-xs text-muted-foreground">staff</p>
        </div>

        {/* Delete / confirm */}
        {confirmDelete ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-red-600 font-semibold whitespace-nowrap">Delete outlet?</span>
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="text-xs bg-red-600 hover:bg-red-700 text-white font-semibold px-2.5 py-1.5 rounded-lg transition disabled:opacity-50 flex items-center gap-1">
              {deleteMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : "Yes, delete"}
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="text-xs bg-muted hover:bg-border text-muted-foreground font-semibold px-2.5 py-1.5 rounded-lg transition">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
            className="p-2 rounded-lg text-muted-foreground/60 hover:text-red-500 hover:bg-red-50 transition shrink-0">
            <Trash2 size={15} />
          </button>
        )}

        {/* Chevron */}
        <button onClick={onToggle} className={`ml-1 text-muted-foreground transition-transform duration-200 shrink-0 ${expanded ? "rotate-180" : ""}`}>
          <ChevronDown size={16} />
        </button>
      </div>

      {expanded && (
        <>
          <div className="border-t border-border mx-5" />
          <StaffPanel outletId={outlet.id} outletCode={outlet.code} />
        </>
      )}
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────── */
export default function OutletsPage() {
  const [showAdd, setShowAdd]                   = useState(false);
  const [expandedOutletId, setExpandedOutletId] = useState<string | null>(null);
  const [expandedCity, setExpandedCity]         = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<{ data: OutletRow[] }>({
    queryKey: ["outlets"],
    queryFn: () => apiClient.get("/outlets").then(r => r.data),
    staleTime: 60_000,
  });

  const outlets = data?.data ?? [];

  const byCity = outlets.reduce<Record<string, OutletRow[]>>((acc, o) => {
    const city = o.address?.city || "Other";
    if (!acc[city]) acc[city] = [];
    acc[city].push(o);
    return acc;
  }, {});
  const cities = Object.keys(byCity).sort();

  const totalStaff   = outlets.reduce((s, o) => s + Number(o.active_staff_count ?? o.activeStaffCount ?? 0), 0);
  const totalOutlets = outlets.length;

  function toggleOutlet(id: string) {
    setExpandedOutletId(prev => prev === id ? null : id);
    setExpandedCity(null);
  }
  function toggleCity(city: string) {
    setExpandedCity(prev => prev === city ? null : city);
    setExpandedOutletId(null);
  }

  return (
    <>
      <AddOutletModal open={showAdd} onClose={() => setShowAdd(false)} />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Outlets</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isLoading ? "Loading…" : `${totalOutlets} outlets · ${cities.length} cities · ${totalStaff} staff`}
            </p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition shadow-sm">
            <Plus size={15} /> Add Outlet
          </button>
        </div>

        {/* City summary pills — click to view ALL staff in that city */}
        {!isLoading && cities.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            {cities.map(city => {
              const cityOutlets = byCity[city];
              const cityStaff   = cityOutlets.reduce((s, o) => s + Number(o.active_staff_count ?? o.activeStaffCount ?? 0), 0);
              const active      = expandedCity === city;
              return (
                <button key={city} onClick={() => toggleCity(city)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition border ${
                    active
                      ? "bg-blue-600 text-white border-blue-600 shadow"
                      : "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-500/30 hover:bg-blue-100"
                  }`}>
                  <MapPin size={11} />
                  {city}: {cityOutlets.length} outlets · {cityStaff} staff
                  <ChevronRight size={11} className={`transition-transform ${active ? "rotate-90" : ""}`} />
                </button>
              );
            })}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl border border-border px-5 py-4 animate-pulse flex items-center gap-4">
                <div className="w-10 h-10 bg-border rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-border rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
                <div className="h-6 w-12 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <span className="text-4xl">⚠️</span>
            <p className="font-semibold text-foreground">Failed to load outlets</p>
            <p className="text-sm text-muted-foreground">Make sure the API server is running on port 4000</p>
          </div>
        ) : (
          <div className="space-y-8">
            {cities.map(city => {
              const cityOutlets = byCity[city];
              const cityStaff   = cityOutlets.reduce((s, o) => s + Number(o.active_staff_count ?? o.activeStaffCount ?? 0), 0);
              const cityOpen    = expandedCity === city;

              return (
                <div key={city}>
                  {/* City header — click name to see all city staff */}
                  <div className="flex items-center gap-3 mb-3">
                    <button onClick={() => toggleCity(city)} className="flex items-center gap-2 group">
                      <MapPin size={15} className="text-blue-500 shrink-0" />
                      <h2 className="text-base font-bold text-foreground group-hover:text-blue-600 transition">{city}</h2>
                      <ChevronDown size={14} className={`text-muted-foreground transition-transform ${cityOpen ? "rotate-180" : ""}`} />
                    </button>
                    <span className="text-xs text-muted-foreground font-medium">
                      {cityOutlets.length} outlets · {cityStaff} staff
                    </span>
                    <div className="flex-1 h-px bg-border" />
                    {cityOpen && (
                      <span className="text-xs font-semibold text-blue-600">All {cityStaff} staff shown below</span>
                    )}
                  </div>

                  {/* City-wide staff panel */}
                  {cityOpen && (
                    <div className="bg-card rounded-2xl border border-blue-200 dark:border-blue-500/30 shadow-sm mb-4 overflow-hidden">
                      <div className="px-5 py-3 bg-blue-50 dark:bg-blue-500/15 border-b border-blue-100 dark:border-blue-500/30 flex items-center gap-2">
                        <Users size={14} className="text-blue-600" />
                        <p className="text-sm font-bold text-blue-800 dark:text-blue-300">All Staff in {city}</p>
                        <span className="text-xs text-blue-400 ml-auto">Click a department to filter</span>
                      </div>
                      <CityStaffPanel outlets={cityOutlets} />
                    </div>
                  )}

                  {/* Individual outlet accordions */}
                  <div className="space-y-2">
                    {cityOutlets.map(outlet => (
                      <OutletAccordion
                        key={outlet.id}
                        outlet={outlet}
                        expanded={expandedOutletId === outlet.id}
                        onToggle={() => toggleOutlet(outlet.id)}
                        onDelete={() => setExpandedOutletId(null)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
