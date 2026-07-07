"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Bell, LogOut, MapPin, Hash, Briefcase, Mail, ChevronRight, type LucideIcon } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { Skeleton } from "@/components/ui/skeleton";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";

interface Profile {
  name: string;
  email: string;
  role: string;
  employeeId?: string | null;
  outletName?: string | null;
  positionName?: string | null;
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="ml-auto truncate text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function LinkRow({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className="flex min-h-[44px] items-center gap-3 p-4 transition hover:bg-muted">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-medium text-foreground">{label}</span>
      <ChevronRight className="ml-auto size-4 text-muted-foreground" />
    </Link>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const t = useTranslations("profile");
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const { data, isLoading } = useQuery<{ data: Profile }>({
    queryKey: ["me-profile"],
    queryFn: () => apiClient.get("/me").then((r) => r.data),
  });
  const p = data?.data;
  const name = p?.name || user?.name || user?.email || "";
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const role = (p?.role || user?.role || "").replace(/_/g, " ");

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-6">
      <div className="flex items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
          {initials || "?"}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-foreground">{name}</h1>
          <p className="truncate text-sm capitalize text-muted-foreground">{role}</p>
        </div>
      </div>

      <section className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : (
          <>
            {p?.employeeId && <InfoRow icon={Hash} label="Employee ID" value={p.employeeId} />}
            {p?.positionName && <InfoRow icon={Briefcase} label="Position" value={p.positionName} />}
            {p?.outletName && <InfoRow icon={MapPin} label="Outlet" value={p.outletName} />}
            <InfoRow icon={Mail} label="Email" value={p?.email || user?.email || "—"} />
          </>
        )}
      </section>

      <section className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        <LinkRow href="/change-password" icon={KeyRound} label={t("changePassword")} />
        <LinkRow href="/settings/notifications" icon={Bell} label={t("notificationSettings")} />
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">{t("language")}</p>
        <LocaleSwitcher />
      </section>

      <button
        onClick={() => {
          logout();
          router.replace("/login");
        }}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm font-semibold text-danger transition hover:bg-muted"
      >
        <LogOut className="size-4" /> {t("signOut")}
      </button>
    </div>
  );
}
