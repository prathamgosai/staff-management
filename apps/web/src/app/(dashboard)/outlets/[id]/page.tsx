"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  ArrowLeft, MapPin, Users, Building2, Coffee, Utensils,
  ShoppingBag, Truck, Wine, MoreHorizontal, Phone, Hash,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

/* ─── types ──────────────────────────────────────────────────────────── */
interface OutletDetail {
  id: string; name: string; code: string; type: string;
  brand_name: string; is_active: boolean;
  address: { city?: string; state?: string; country?: string };
  contact: { phone?: string; email?: string };
  seating_capacity?: number;
}

interface StaffRow {
  id: string; name: string; phone: string;
  employee_id?: string; employeeId?: string;
  employment_type?: string; employmentType?: string;
  employment_status?: string; employmentStatus?: string;
  position_name?: string; positionName?: string;
  department_name?: string; departmentName?: string;
}

/* ─── helpers ─────────────────────────────────────────────────────────── */
function f(row: StaffRow, s: keyof StaffRow, c: keyof StaffRow): string {
  return (row[c] as string) || (row[s] as string) || "";
}

const OUTLET_TYPE_MAP: Record<string, { label: string; Icon: LucideIcon }> = {
  dine_in:       { label: "Dine In",       Icon: Utensils },
  quick_service: { label: "Quick Service", Icon: ShoppingBag },
  cafe:          { label: "Café",          Icon: Coffee },
  cloud_kitchen: { label: "Cloud Kitchen", Icon: Truck },
  bar:           { label: "Bar",           Icon: Wine },
  other:         { label: "Other",         Icon: MoreHorizontal },
};

const TYPE_ICON_BG: Record<string, string> = {
  dine_in: "bg-blue-100 dark:bg-blue-500/20 text-blue-600",
  quick_service: "bg-orange-100 dark:bg-orange-500/20 text-orange-600",
  cafe: "bg-amber-100 dark:bg-amber-500/20 text-amber-600",
  cloud_kitchen: "bg-violet-100 dark:bg-violet-500/20 text-violet-600",
  bar: "bg-rose-100 dark:bg-rose-500/20 text-rose-600",
  other: "bg-muted text-muted-foreground",
};

const STATUS_CLS: Record<string, string> = {
  active:     "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200",
  on_leave:   "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200",
  probation:  "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-1 ring-blue-200",
  terminated: "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 ring-1 ring-red-200",
  inactive:   "bg-muted text-muted-foreground",
};

const TYPE_CLS: Record<string, string> = {
  full_time:  "bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300",
  part_time:  "bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300",
  contract:   "bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  temporary:  "bg-yellow-50 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  intern:     "bg-pink-50 dark:bg-pink-500/15 text-pink-700 dark:text-pink-300",
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

/* ─── Department Section ──────────────────────────────────────────────── */
function DeptSection({ dept, members }: { dept: string; members: StaffRow[] }) {
  const active = members.filter(m => (m.employmentStatus || m.employment_status) === "active").length;
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {/* dept header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-muted border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <h3 className="font-bold text-foreground text-sm">{dept}</h3>
          <span className="text-xs text-muted-foreground font-medium">{members.length} staff</span>
        </div>
        <span className="text-xs text-emerald-600 font-medium">{active} active</span>
      </div>

      {/* staff rows */}
      <div className="divide-y divide-border">
        {members.map(staff => {
          const empId    = f(staff, "employee_id",    "employeeId");
          const empType  = f(staff, "employment_type",  "employmentType");
          const empStatus= f(staff, "employment_status","employmentStatus");
          const position = f(staff, "position_name",   "positionName");

          return (
            <div key={staff.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-blue-50/30 transition group">
              {/* avatar */}
              <div className={`w-9 h-9 rounded-full ${avatarColor(staff.name)} text-white flex items-center justify-center font-bold text-xs shrink-0`}>
                {initials(staff.name)}
              </div>

              {/* name + phone */}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground text-sm leading-tight truncate">{staff.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{staff.phone}</p>
              </div>

              {/* emp id */}
              <div className="hidden sm:block shrink-0">
                <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {empId || "—"}
                </span>
              </div>

              {/* position */}
              <div className="hidden md:block w-36 shrink-0">
                <p className="text-xs text-muted-foreground truncate">{position || "—"}</p>
              </div>

              {/* type */}
              <div className="hidden lg:block shrink-0">
                {empType
                  ? <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_CLS[empType] ?? "bg-muted text-muted-foreground"}`}>{empType.replace(/_/g, " ")}</span>
                  : null}
              </div>

              {/* status */}
              <div className="shrink-0">
                {empStatus
                  ? <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CLS[empStatus] ?? "bg-muted text-muted-foreground"}`}>{empStatus.replace(/_/g, " ")}</span>
                  : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────── */
export default function OutletDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data: outletRes, isLoading: outletLoading } = useQuery<{ data: OutletDetail }>({
    queryKey: ["outlet", id],
    queryFn: () => apiClient.get(`/outlets/${id}`).then(r => r.data),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: staffRes, isLoading: staffLoading, isError: staffError, refetch: refetchStaff } = useQuery<{
    data: StaffRow[];
    pagination: { total: number };
  }>({
    queryKey: ["staff-by-outlet", id],
    queryFn: () => apiClient.get("/staff", { params: { outletId: id, limit: 300, page: 1 } }).then(r => r.data),
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: "always",
    retry: 2,
  });

  const outlet = outletRes?.data;
  const staff  = staffRes?.data ?? [];
  const total  = staffRes?.pagination?.total ?? 0;

  // Group staff by department
  const byDept = staff.reduce<Record<string, StaffRow[]>>((acc, s) => {
    const dept = f(s, "department_name", "departmentName") || "Unassigned";
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(s);
    return acc;
  }, {});

  const deptKeys = Object.keys(byDept).sort();

  // Stats
  const activeCount   = staff.filter(s => (s.employmentStatus || s.employment_status) === "active").length;
  const onLeaveCount  = staff.filter(s => (s.employmentStatus || s.employment_status) === "on_leave").length;
  const fullTimeCount = staff.filter(s => (s.employmentType || s.employment_type) === "full_time").length;

  const typeEntry = outlet ? (OUTLET_TYPE_MAP[outlet.type] ?? OUTLET_TYPE_MAP.other) : null;
  const TypeIcon  = typeEntry?.Icon ?? Building2;
  const iconBg    = outlet ? (TYPE_ICON_BG[outlet.type] ?? TYPE_ICON_BG.other) : "bg-muted text-muted-foreground";

  const isLoading = outletLoading || staffLoading;

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link href="/outlets" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition">
        <ArrowLeft size={15} />
        Back to Outlets
      </Link>

      {/* Outlet header */}
      {outletLoading ? (
        <div className="bg-card rounded-2xl border border-border p-6 animate-pulse">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-border rounded-2xl" />
            <div className="flex-1 space-y-3">
              <div className="h-6 bg-border rounded w-48" />
              <div className="h-4 bg-muted rounded w-64" />
              <div className="flex gap-3">
                <div className="h-8 bg-muted rounded w-24" />
                <div className="h-8 bg-muted rounded w-24" />
                <div className="h-8 bg-muted rounded w-24" />
              </div>
            </div>
          </div>
        </div>
      ) : outlet && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-start gap-4">
            <div className={`${iconBg} w-14 h-14 rounded-2xl flex items-center justify-center shrink-0`}>
              <TypeIcon size={26} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground">{outlet.name}</h1>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${outlet.is_active ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200" : "bg-muted text-muted-foreground"}`}>
                  {outlet.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              <p className="text-sm text-muted-foreground mt-0.5">
                {outlet.brand_name}
                <span className="font-mono text-xs ml-2 bg-muted text-muted-foreground px-2 py-0.5 rounded">{outlet.code}</span>
                <span className={`ml-2 text-xs px-2.5 py-0.5 rounded-full font-medium ${iconBg}`}>{typeEntry?.label}</span>
              </p>

              <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                {outlet.address?.city && (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={14} className="text-muted-foreground" />
                    {outlet.address.city}{outlet.address.state ? `, ${outlet.address.state}` : ""}
                  </span>
                )}
                {outlet.contact?.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone size={14} className="text-muted-foreground" />
                    {outlet.contact.phone}
                  </span>
                )}
                {outlet.seating_capacity && (
                  <span className="flex items-center gap-1.5">
                    <Hash size={14} className="text-muted-foreground" />
                    {outlet.seating_capacity} seats
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-border">
            {[
              { label: "Total Staff",  value: total,         color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-500/15" },
              { label: "Active",       value: activeCount,   color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-500/15" },
              { label: "On Leave",     value: onLeaveCount,  color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-500/15" },
              { label: "Full Time",    value: fullTimeCount, color: "text-violet-600",  bg: "bg-violet-50 dark:bg-violet-500/15" },
            ].map(stat => (
              <div key={stat.label} className={`${stat.bg} rounded-xl px-4 py-3`}>
                <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Staff section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Users size={18} className="text-muted-foreground" />
            Staff Members
          </h2>
          {!isLoading && deptKeys.length > 1 && (
            <span className="text-xs text-muted-foreground">{deptKeys.length} departments</span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl border border-border overflow-hidden animate-pulse">
                <div className="px-5 py-3.5 bg-muted border-b border-border">
                  <div className="h-4 bg-border rounded w-32" />
                </div>
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0">
                    <div className="w-9 h-9 rounded-full bg-border shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-border rounded w-36" />
                      <div className="h-3 bg-muted rounded w-24" />
                    </div>
                    <div className="h-6 bg-muted rounded w-20" />
                    <div className="h-6 bg-muted rounded w-16" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : staffError ? (
          <div className="bg-card rounded-2xl border border-red-200 dark:border-red-500/30 flex flex-col items-center gap-3 py-16 text-center">
            <Users size={40} strokeWidth={1.2} className="text-red-300" />
            <div>
              <p className="font-semibold text-foreground">Could not load staff</p>
              <p className="text-xs text-muted-foreground mt-0.5">There was an error fetching staff data</p>
            </div>
            <button onClick={() => refetchStaff()}
              className="mt-2 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
              Try Again
            </button>
          </div>
        ) : staff.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border flex flex-col items-center gap-3 py-16 text-center">
            <Users size={40} strokeWidth={1.2} className="text-muted-foreground/60" />
            <div>
              <p className="font-semibold text-muted-foreground">No staff assigned to this outlet</p>
              <p className="text-xs text-muted-foreground mt-0.5">Add staff members from the Staff page</p>
            </div>
            <Link href="/staff"
              className="mt-2 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
              Go to Staff
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {deptKeys.map(dept => (
              <DeptSection key={dept} dept={dept} members={byDept[dept]} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
