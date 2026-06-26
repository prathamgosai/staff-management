"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { fileToAvatarDataUrl } from "@/lib/image";
import Link from "next/link";
import { useState, useRef } from "react";
import {
  ArrowLeft, Phone, Mail, MapPin, Briefcase, Calendar,
  Clock, Building2, User, ChevronDown, Check, Loader2,
  Pencil, X, Shield, Hash, Camera,
} from "lucide-react";
import { format } from "date-fns";

/* ─── types ──────────────────────────────────────────────────────────── */
interface StaffDetail {
  id: string; employeeId: string; name: string;
  avatarUrl: string | null;
  email: string | null; phone: string; whatsapp: string | null;
  primaryOutletId: string; currentOutletId: string;
  departmentId: string; positionId: string;
  employmentType: string; employmentStatus: string;
  joinDate: string; baseSalary: number | null;
  hourlyRate: number | null; weeklyHours: string | null;
  overtimeEligible: boolean;
  departmentName: string; positionName: string;
  outletName: string; outletCode: string;
}

const STATUS_CLS: Record<string, string> = {
  active:     "bg-emerald-100 text-emerald-700",
  on_leave:   "bg-amber-100 text-amber-700",
  probation:  "bg-blue-100 text-blue-700",
  terminated: "bg-red-100 text-red-700",
  inactive:   "bg-gray-100 text-gray-600",
};
const TYPE_CLS: Record<string, string> = {
  full_time: "bg-violet-100 text-violet-700",
  part_time: "bg-orange-100 text-orange-700",
  contract:  "bg-cyan-100 text-cyan-700",
  temporary: "bg-yellow-100 text-yellow-700",
  intern:    "bg-pink-100 text-pink-700",
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

/* ─── Info row ────────────────────────────────────────────────────────── */
function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={14} className="text-gray-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-400 mb-0.5">{label}</p>
        <div className="text-sm font-semibold text-gray-900">{value || <span className="text-gray-300 font-normal">—</span>}</div>
      </div>
    </div>
  );
}

/* ─── Edit Status Modal ───────────────────────────────────────────────── */
function EditStatusModal({ staffId, current, onClose }: { staffId: string; current: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(current);
  const mutation = useMutation({
    mutationFn: () => apiClient.patch(`/staff/${staffId}`, { employmentStatus: status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff-detail", staffId] }); onClose(); },
  });
  const statuses = ["active", "on_leave", "probation", "terminated", "inactive"];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-80 mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">Update Status</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="space-y-2 mb-5">
          {statuses.map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition ${
                status === s ? "border-blue-500 bg-blue-50 text-blue-700" : "border-transparent bg-gray-50 text-gray-700 hover:bg-gray-100"
              }`}>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLS[s] ?? "bg-gray-100 text-gray-600"}`}>
                {s.replace(/_/g, " ")}
              </span>
            </button>
          ))}
        </div>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || status === current}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2">
          {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Save Status
        </button>
      </div>
    </div>
  );
}

/* ─── Leave requests ──────────────────────────────────────────────────── */
function LeaveHistory({ staffId }: { staffId: string }) {
  const { data } = useQuery<{ data: { id: string; leaveType: string; startDate: string; endDate: string; status: string; reason: string }[] }>({
    queryKey: ["leave-requests", staffId],
    queryFn: () => apiClient.get("/leave/requests", { params: { staffId, limit: 10 } }).then(r => r.data),
    staleTime: 30_000,
  });
  const leaves = data?.data ?? [];
  if (leaves.length === 0) return <p className="text-sm text-gray-400 py-4 text-center">No leave records found</p>;
  return (
    <div className="space-y-2">
      {leaves.map(l => (
        <div key={l.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 capitalize">{l.leaveType?.replace(/_/g, " ")}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {l.startDate ? format(new Date(l.startDate), "d MMM yyyy") : "—"} →{" "}
              {l.endDate   ? format(new Date(l.endDate),   "d MMM yyyy") : "—"}
            </p>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            l.status === "approved"  ? "bg-emerald-100 text-emerald-700" :
            l.status === "rejected"  ? "bg-red-100 text-red-700" :
            "bg-amber-100 text-amber-700"
          }`}>
            {l.status}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Avatar uploader ─────────────────────────────────────────────────── */
function AvatarUploader({ staffId, name, avatarUrl }: { staffId: string; name: string; avatarUrl: string | null }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (newUrl: string) => apiClient.put(`/staff/${staffId}/avatar`, { avatarUrl: newUrl }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-detail", staffId] });
      qc.invalidateQueries({ queryKey: ["staff"] });
      setError(null);
    },
    onError: () => setError("Upload failed. Try again."),
  });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-selected later
    if (!file) return;
    setError(null);
    if (file.size > 10 * 1024 * 1024) { setError("Image must be under 10 MB."); return; }
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      mutation.mutate(dataUrl);
    } catch (err) {
      setError((err as Error).message || "Could not process that image.");
    }
  }

  const busy = mutation.isPending;

  return (
    <div className="shrink-0">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
        title="Upload photo"
        className="group relative w-20 h-20 rounded-2xl overflow-hidden block focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className={`w-full h-full ${avatarColor(name)} text-white flex items-center justify-center text-2xl font-black`}>
            {initials(name)}
          </span>
        )}
        <span className={`absolute inset-0 flex items-center justify-center bg-black/45 text-white transition-opacity ${busy ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
        </span>
      </button>
      {avatarUrl && !busy && (
        <button type="button" onClick={() => mutation.mutate("")}
          className="mt-1.5 w-full text-[11px] text-gray-400 hover:text-red-500 transition">
          Remove
        </button>
      )}
      {error && <p className="mt-1.5 text-[11px] text-red-500 leading-tight w-20">{error}</p>}
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────── */
export default function StaffDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [showEditStatus, setShowEditStatus] = useState(false);

  const { data, isLoading, isError } = useQuery<{ data: StaffDetail }>({
    queryKey: ["staff-detail", id],
    queryFn: () => apiClient.get(`/staff/${id}`).then(r => r.data),
    staleTime: 30_000,
  });

  const staff = data?.data;

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
        <div className="bg-white rounded-2xl border border-gray-200 p-8 animate-pulse space-y-4">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-full bg-gray-200 shrink-0" />
            <div className="space-y-3 flex-1">
              <div className="h-6 bg-gray-200 rounded w-1/2" />
              <div className="h-4 bg-gray-100 rounded w-1/3" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !staff) {
    return (
      <div className="max-w-3xl mx-auto text-center py-24">
        <p className="text-2xl mb-2">⚠️</p>
        <p className="font-semibold text-gray-700">Staff member not found</p>
        <Link href="/staff" className="mt-4 inline-flex items-center gap-2 text-blue-600 text-sm font-medium">
          <ArrowLeft size={14} /> Back to Staff
        </Link>
      </div>
    );
  }

  const joinDateStr = staff.joinDate
    ? format(new Date(staff.joinDate), "d MMMM yyyy")
    : "—";

  return (
    <>
      {showEditStatus && (
        <EditStatusModal staffId={id} current={staff.employmentStatus} onClose={() => setShowEditStatus(false)} />
      )}

      <div className="max-w-3xl mx-auto space-y-5">
        {/* Back */}
        <Link href="/staff" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 font-medium transition">
          <ArrowLeft size={15} /> Back to Staff
        </Link>

        {/* Profile header card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <AvatarUploader staffId={id} name={staff.name} avatarUrl={staff.avatarUrl} />

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{staff.name}</h1>
                  <p className="text-sm text-gray-500 mt-0.5">{staff.positionName} · {staff.departmentName}</p>
                </div>
                <button onClick={() => setShowEditStatus(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition">
                  <Pencil size={11} className="text-gray-400" />
                  Edit Status
                </button>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2 mt-3">
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS_CLS[staff.employmentStatus] ?? "bg-gray-100 text-gray-600"}`}>
                  {staff.employmentStatus.replace(/_/g, " ")}
                </span>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${TYPE_CLS[staff.employmentType] ?? "bg-gray-100 text-gray-600"}`}>
                  {staff.employmentType.replace(/_/g, " ")}
                </span>
                <span className="text-xs font-mono font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-600">
                  {staff.employeeId}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Two-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Contact & Identity */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Contact</p>
            <InfoRow icon={Phone} label="Phone" value={staff.phone} />
            <InfoRow icon={Mail}  label="Email" value={staff.email} />
            <InfoRow icon={Hash}  label="Employee ID" value={staff.employeeId} />
          </div>

          {/* Work Info */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Work Info</p>
            <InfoRow icon={Building2}  label="Outlet"      value={`${staff.outletName} (${staff.outletCode})`} />
            <InfoRow icon={Briefcase}  label="Department"  value={staff.departmentName} />
            <InfoRow icon={User}       label="Position"    value={staff.positionName} />
            <InfoRow icon={Calendar}   label="Joined"      value={joinDateStr} />
          </div>

          {/* Schedule */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Schedule</p>
            <InfoRow icon={Clock}   label="Weekly Hours"      value={staff.weeklyHours ? `${parseFloat(staff.weeklyHours)} hrs/week` : null} />
            <InfoRow icon={Shield}  label="Overtime Eligible" value={staff.overtimeEligible ? "Yes" : "No"} />
            {staff.baseSalary  && <InfoRow icon={Briefcase} label="Base Salary"  value={`₹${staff.baseSalary.toLocaleString()}`} />}
            {staff.hourlyRate  && <InfoRow icon={Briefcase} label="Hourly Rate"  value={`₹${staff.hourlyRate}/hr`} />}
          </div>

          {/* Leave History */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Leave History</p>
            <LeaveHistory staffId={id} />
          </div>
        </div>
      </div>
    </>
  );
}
