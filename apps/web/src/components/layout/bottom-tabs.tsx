"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home, CalendarDays, Clock, CalendarOff, UserRound, type LucideIcon } from "lucide-react";

interface Tab {
  href: string;
  labelKey: "home" | "roster" | "attendance" | "leave" | "profile";
  icon: LucideIcon;
}

const TABS: Tab[] = [
  { href: "/home", labelKey: "home", icon: Home },
  { href: "/scheduling", labelKey: "roster", icon: CalendarDays },
  { href: "/attendance", labelKey: "attendance", icon: Clock },
  { href: "/leave", labelKey: "leave", icon: CalendarOff },
  { href: "/profile", labelKey: "profile", icon: UserRound },
];

/**
 * Mobile-only bottom tab bar (hidden at md+). The desktop sidebar is unchanged;
 * on mobile the full nav still lives in the topbar hamburger sheet, and these five
 * tabs give one-tap access to the core sections. Safe-area padding keeps it clear of
 * the iOS home indicator in the installed PWA. Touch targets are ≥ 52px.
 */
export function BottomTabs() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex">
        {TABS.map(({ href, labelKey, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-5" />
                <span>{t(labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
