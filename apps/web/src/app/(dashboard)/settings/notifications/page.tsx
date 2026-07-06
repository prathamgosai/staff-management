"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, MessageCircle, Mail } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/components/ui/sonner";

interface Prefs {
  inAppEnabled: boolean;
  whatsappEnabled: boolean;
  emailEnabled: boolean;
}

const DEFAULTS: Prefs = { inAppEnabled: true, whatsappEnabled: true, emailEnabled: true };

const CHANNELS: { key: keyof Prefs; icon: typeof Bell; label: string; desc: string }[] = [
  { key: "inAppEnabled", icon: Bell, label: "In-app", desc: "Show updates in the notification bell and history." },
  { key: "whatsappEnabled", icon: MessageCircle, label: "WhatsApp", desc: "Message your WhatsApp number when a phone is on file." },
  { key: "emailEnabled", icon: Mail, label: "Email", desc: "Fall back to email when WhatsApp can't be delivered." },
];

export default function NotificationSettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery<{ data: Prefs }>({
    queryKey: ["notification-preferences"],
    queryFn: () => apiClient.get("/notifications/preferences").then((r) => r.data),
  });

  const [draft, setDraft] = useState<Prefs>(DEFAULTS);
  useEffect(() => {
    if (data?.data) setDraft(data.data);
  }, [data]);

  const save = useMutation({
    mutationFn: (next: Prefs) => apiClient.put("/notifications/preferences", next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-preferences"] });
      toast.success("Preferences saved.");
    },
  });

  function toggle(key: keyof Prefs) {
    const next = { ...draft, [key]: !draft[key] };
    setDraft(next); // optimistic
    save.mutate(next);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Notification preferences</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Choose how you&apos;re notified about rosters, shift changes and leave.
        </p>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {CHANNELS.map(({ key, icon: Icon, label, desc }) => (
          <div key={key} className="flex items-center gap-3 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{label}</p>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft[key]}
              aria-label={`Toggle ${label} notifications`}
              onClick={() => toggle(key)}
              disabled={save.isPending}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60 ${draft[key] ? "bg-primary" : "bg-muted-foreground/30"}`}
            >
              <span
                className={`inline-block size-5 transform rounded-full bg-background shadow transition ${draft[key] ? "translate-x-5" : "translate-x-0.5"}`}
              />
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        In-app notifications always appear in the app; WhatsApp and email delivery follow the choices above.
        WhatsApp also requires a phone number on your staff profile and the integration switched on.
      </p>
    </div>
  );
}
