"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { format } from "date-fns";
import { UserCheck, UserX, Ticket, Loader2, RefreshCw, ShieldCheck, Bell } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";

interface PendingUser {
  id: string;
  name: string;
  email: string;
  created_at: string;
  ticket_number: string;
  employee_id?: string;
  outlet_name?: string;
  position_name?: string;
}

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const isAdmin = useAuthStore((s) => s.user?.role === "super_admin");
  const [actingId, setActingId] = useState<string | null>(null);
  const [actingAction, setActingAction] = useState<"approve" | "reject" | null>(null);

  const { data, isLoading, refetch } = useQuery<{ data: PendingUser[] }>({
    queryKey: ["pending-registrations"],
    queryFn: () => apiClient.get("/auth/pending-registrations").then(r => r.data),
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 30_000,
    enabled: isAdmin,
  });

  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      apiClient.put(`/auth/registrations/${id}/review`, { action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-registrations"] });
      setActingId(null);
      setActingAction(null);
    },
    onError: () => { setActingId(null); setActingAction(null); },
  });

  function act(id: string, action: "approve" | "reject") {
    setActingId(id);
    setActingAction(action);
    mutation.mutate({ id, action });
  }

  const rows = data?.data ?? [];

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto text-center py-24">
        <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
          <ShieldCheck size={26} strokeWidth={1.5} className="text-red-400" />
        </div>
        <p className="font-bold text-gray-700">Restricted area</p>
        <p className="text-sm text-gray-400 mt-1">Only super admins can review account approvals.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <ShieldCheck size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Account Approvals</h1>
            <p className="text-sm text-gray-500 mt-0.5">Review staff self-registration requests</p>
          </div>
          {rows.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">
              {rows.length} new
            </span>
          )}
        </div>
        <button onClick={() => refetch()}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl px-3 py-2 transition hover:bg-gray-50">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl px-6 py-5 text-white flex gap-4 items-start">
        <Bell size={20} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold mb-1">How the approval flow works</p>
          <ol className="text-sm text-blue-100 space-y-0.5 list-decimal list-inside">
            <li>Staff goes to <span className="font-mono bg-white/20 px-1 rounded text-xs">/register</span> → enters their name, email and sets a password</li>
            <li>A unique <strong className="text-white">ticket number</strong> is generated and shown to the staff member</li>
            <li>Staff shares their ticket with the Head Chef / Manager</li>
            <li>Head Chef finds the ticket here and clicks <strong className="text-white">Approve</strong></li>
            <li>Staff can now sign in with their email and password</li>
          </ol>
        </div>
      </div>

      {/* Pending table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ticket size={17} className="text-gray-400" />
            <h2 className="font-bold text-gray-900">Pending Tickets</h2>
          </div>
          {rows.length > 0 && (
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full">
              {rows.length} awaiting review
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-400">
            <Loader2 size={28} className="animate-spin" />
            <p className="text-sm">Loading pending requests…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <ShieldCheck size={26} strokeWidth={1.5} className="text-emerald-400" />
            </div>
            <p className="font-semibold text-gray-500">No pending approvals</p>
            <p className="text-sm text-gray-400 mt-1">All registration requests have been reviewed.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {rows.map(row => (
              <div key={row.id} className="px-5 py-4 hover:bg-gray-50/60 transition flex items-center gap-4">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
                  {row.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900">{row.name}</p>
                    {/* Ticket badge */}
                    <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                      <Ticket size={10} />
                      {row.ticket_number}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 truncate">{row.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Registered {format(new Date(row.created_at), "d MMM yyyy 'at' HH:mm")}
                    {row.outlet_name && ` · ${row.outlet_name}`}
                    {row.position_name && ` · ${row.position_name}`}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => act(row.id, "approve")}
                    disabled={mutation.isPending && actingId === row.id}
                    className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold px-4 py-2 rounded-xl transition">
                    {mutation.isPending && actingId === row.id && actingAction === "approve"
                      ? <Loader2 size={12} className="animate-spin" />
                      : <UserCheck size={13} />}
                    Approve
                  </button>
                  <button
                    onClick={() => act(row.id, "reject")}
                    disabled={mutation.isPending && actingId === row.id}
                    className="inline-flex items-center gap-1.5 border border-red-200 hover:bg-red-50 disabled:opacity-60 text-red-600 text-xs font-bold px-4 py-2 rounded-xl transition">
                    {mutation.isPending && actingId === row.id && actingAction === "reject"
                      ? <Loader2 size={12} className="animate-spin" />
                      : <UserX size={13} />}
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
