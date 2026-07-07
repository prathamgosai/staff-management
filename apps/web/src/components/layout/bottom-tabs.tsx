"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, Clock, CalendarOff, UserRound, type LucideIcon } from "lucide-react";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
}

const TABS: Tab[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/scheduling", label: "Roster", icon: CalendarDays },
  { href: "/attendance", label: "Attendance", icon: Clock },
  { href: "/leave", label: "Leave", icon: CalendarOff },
  { href: "/profile", label: "Profile", icon: UserRound },
];

/**
 * Mobile-only bottom tab bar (hidden at md+). The desktop sidebar is unchanged;
 * on mobile the full nav still lives in the topbar hamburger sheet, and these five
 * tabs give one-tap access to the core sections. Safe-area padding keeps it clear of
 * the iOS home indicator in the installed PWA. Touch targets are ≥ 52px.
 */
export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex">
        {TABS.map(({ href, label, icon: Icon }) => {
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
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
