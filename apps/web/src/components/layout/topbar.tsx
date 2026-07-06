"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu, Search, LogOut, KeyRound } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { NotificationBell } from "./notification-bell";
import { ALL_NAV_ITEMS } from "./nav";
import { OutletSwitcher } from "./outlet-switcher";
import { CommandMenu } from "./command-menu";
import { MobileSidebar } from "./sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { getInitials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function pageTitle(pathname: string): string {
  const match = ALL_NAV_ITEMS.find(
    (i) => pathname === i.href || (i.href !== "/dashboard" && pathname.startsWith(i.href)),
  );
  return match?.label ?? "BookendsShiftly";
}

export function Topbar() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  // ⌘K / Ctrl+K opens the command palette.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function signOut() {
    logout();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 shadow-card sm:px-4">
      {/* Mobile nav trigger */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 border-sidebar-border p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <MobileSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <h1 className="hidden text-lg font-semibold tracking-tight md:block">{pageTitle(pathname)}</h1>

      <Separator orientation="vertical" className="mx-1 hidden h-6 md:block" />

      <OutletSwitcher />

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {/* Search */}
        <Button
          variant="outline"
          onClick={() => setSearchOpen(true)}
          className="hidden h-9 w-56 justify-start gap-2 px-3 font-normal text-muted-foreground lg:flex"
          aria-label="Search"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </Button>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSearchOpen(true)} aria-label="Search">
          <Search className="size-5" />
        </Button>

        {/* Notifications */}
        <NotificationBell />

        <ThemeToggle />

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-1.5 sm:pl-1.5 sm:pr-2.5" aria-label="Account menu">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {user ? getInitials(user.name || user.email) : "?"}
              </span>
              <span className="hidden min-w-0 flex-col items-start leading-none sm:flex">
                <span className="max-w-[10rem] truncate text-sm font-medium">{user?.name || user?.email}</span>
                <span className="max-w-[10rem] truncate text-xs capitalize text-muted-foreground">
                  {user?.role.replace(/_/g, " ")}
                </span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span className="truncate">{user?.name || user?.email}</span>
              <span className="truncate text-xs font-normal text-muted-foreground">{user?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2" onClick={() => router.push("/change-password")}>
              <KeyRound className="size-4" /> Change password
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-danger focus:text-danger" onClick={signOut}>
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
