"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import { hasPermission } from "@/lib/permissions";
import { usePendingApprovals } from "@/hooks/use-pending-approvals";
import { NAV_GROUPS } from "./nav";
import { cn, getInitials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarSky } from "./sidebar-sky";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-base font-black text-primary-foreground shadow-card">
        W
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold leading-tight text-sidebar-foreground">WorkforceIQ</span>
          <span className="block truncate text-xs text-sidebar-muted">Restaurant Management</span>
        </span>
      )}
    </Link>
  );
}

/** Shared nav body — used by both the desktop rail and the mobile sheet. */
function SidebarBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const pending = usePendingApprovals();

  return (
    <TooltipProvider delayDuration={0}>
      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-5 px-3 py-4" aria-label="Primary">
          {NAV_GROUPS.map((group, gi) => {
            const items = group.items.filter((it) => !it.perm || hasPermission(user, it.perm));
            if (items.length === 0) return null;
            return (
              <div key={group.label ?? `g-${gi}`} className="flex flex-col gap-1">
                {group.label && !collapsed && (
                  <p className="px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-sidebar-muted">
                    {group.label}
                  </p>
                )}
                {items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const showBadge = item.badge && pending > 0;
                  const Icon = item.icon;
                  const link = (
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors",
                        "focus-visible:ring-2 focus-visible:ring-sidebar-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-card"
                          : "text-sidebar-foreground/90 hover:bg-sidebar-hover hover:text-sidebar-foreground",
                      )}
                    >
                      <span className="relative shrink-0">
                        <Icon className="size-[18px]" />
                        {showBadge && collapsed && (
                          <span className="absolute -right-1.5 -top-1.5 size-2 rounded-full bg-danger ring-2 ring-sidebar" />
                        )}
                      </span>
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {showBadge && (
                            <span className="grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-danger px-1.5 text-xs font-bold text-danger-foreground">
                              {pending > 99 ? "99+" : pending}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  );
                  return collapsed ? (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right" className="flex items-center gap-2">
                        {item.label}
                        {showBadge && (
                          <span className="rounded-full bg-danger px-1.5 text-xs font-bold text-danger-foreground">{pending}</span>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <div key={item.href}>{link}</div>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </ScrollArea>
    </TooltipProvider>
  );
}

function UserChip({ collapsed }: { collapsed: boolean }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  return (
    <div className={cn("flex items-center gap-2.5 border-t border-sidebar-border px-4 py-3", collapsed && "justify-center px-0")}>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sidebar-accent text-xs font-bold text-sidebar-accent-foreground">
        {getInitials(user.name || user.email)}
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-sidebar-foreground">{user.name || user.email}</span>
          <span className="block truncate text-xs capitalize text-sidebar-muted">{user.role.replace(/_/g, " ")}</span>
        </span>
      )}
    </div>
  );
}

/** Desktop rail — collapsible to icons. */
export function DesktopSidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        "relative hidden shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out md:flex",
        collapsed ? "w-[4.5rem]" : "w-64",
      )}
    >
      <SidebarSky collapsed={collapsed} />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className={cn("flex h-16 items-center border-b border-sidebar-border px-4", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && <Logo collapsed={false} />}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground"
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
          </Button>
        </div>
        <SidebarBody collapsed={collapsed} />
        <UserChip collapsed={collapsed} />
      </div>
    </aside>
  );
}

/** Mobile sheet body — always expanded; closes the sheet on navigation. */
export function MobileSidebar({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
      <SidebarSky />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="flex h-16 items-center border-b border-sidebar-border px-4">
          <Logo collapsed={false} />
        </div>
        <SidebarBody collapsed={false} onNavigate={onNavigate} />
        <UserChip collapsed={false} />
      </div>
    </div>
  );
}
