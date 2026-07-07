"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MonitorSmartphone, Plus, Trash2, Copy, Check, X, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";

interface KioskDevice {
  id: string;
  label: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/**
 * Manager-only panel to enroll / revoke kiosk devices for one outlet. The raw
 * device token is shown exactly once (right after creation) as an enrollment
 * link; opening it on the tablet stores the token there. Gated by attendance:write.
 */
export function KioskDevicesSection({ outletId }: { outletId: string }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = user?.role === "super_admin" || !!user?.permissions?.includes("attendance:write");

  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  // The just-created enrollment link, shown once. { link } | null
  const [fresh, setFresh] = useState<{ link: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery<{ data: KioskDevice[] }>({
    queryKey: ["kiosk-devices", outletId],
    queryFn: () => apiClient.get("/kiosk/devices", { params: { outletId } }).then((r) => r.data),
    enabled: !!outletId && canManage,
  });

  const createMut = useMutation({
    mutationFn: (payload: { outletId: string; label: string }) =>
      apiClient.post("/kiosk/devices", payload).then((r) => r.data),
    onSuccess: (res) => {
      const token = res?.data?.token as string;
      const link = `${window.location.origin}/kiosk?token=${token}`;
      setFresh({ link, label: res?.data?.label ?? label });
      setLabel("");
      setAdding(false);
      qc.invalidateQueries({ queryKey: ["kiosk-devices", outletId] });
    },
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/kiosk/devices/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kiosk-devices", outletId] }),
  });

  if (!canManage) return null;

  const devices = data?.data ?? [];
  const active = devices.filter((d) => !d.revoked_at);

  async function copyLink() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is visible to copy manually */
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <MonitorSmartphone size={16} className="text-muted-foreground" />
          Kiosk devices
          {active.length > 0 && <span className="text-xs font-medium text-muted-foreground">{active.length} active</span>}
        </h2>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setFresh(null); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
          >
            <Plus size={14} /> Enroll device
          </button>
        )}
      </div>

      <div className="p-5">
        {/* Enrollment link, shown once after creation */}
        {fresh && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                “{fresh.label}” enrolled — open this link on the tablet
              </p>
              <button onClick={() => setFresh(null)} className="text-emerald-700/70 hover:text-emerald-700 dark:text-emerald-300/70">
                <X size={16} />
              </button>
            </div>
            <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">
              This is the only time the link is shown. It contains the device token — treat it like a password.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-emerald-200 bg-card px-3 py-2 text-xs text-foreground dark:border-emerald-500/30">
                {fresh.link}
              </code>
              <button
                onClick={copyLink}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-300 bg-card px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {/* Add form */}
        {adding && (
          <div className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3 sm:flex-row sm:items-center">
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Device name (e.g. Front counter iPad)"
              className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => { if (e.key === "Enter" && label.trim()) createMut.mutate({ outletId, label: label.trim() }); }}
            />
            <div className="flex gap-2">
              <button
                disabled={!label.trim() || createMut.isPending}
                onClick={() => createMut.mutate({ outletId, label: label.trim() })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
              </button>
              <button
                onClick={() => { setAdding(false); setLabel(""); }}
                className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {createMut.isError && (
          <p className="mb-3 text-xs text-red-600">Could not create the device. Please try again.</p>
        )}

        {/* Device list */}
        {isLoading ? (
          <p className="py-4 text-sm text-muted-foreground">Loading…</p>
        ) : devices.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            No kiosk devices yet. Enroll a tablet to let staff clock in with their Employee ID + PIN.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {d.label}
                    {d.revoked_at && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">revoked</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Last seen {fmt(d.last_seen_at)} · added {fmt(d.created_at)}
                  </p>
                </div>
                {!d.revoked_at && (
                  <button
                    onClick={() => { if (confirm(`Revoke “${d.label}”? The device will stop working immediately.`)) revokeMut.mutate(d.id); }}
                    disabled={revokeMut.isPending}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-500/10"
                  >
                    <Trash2 size={13} /> Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
