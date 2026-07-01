"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { NAV_GROUPS } from "./nav";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";

/**
 * Global search / command palette (⌘K or the top-bar search). Navigates to any
 * permitted destination. Kept navigation-only so it introduces no new data calls.
 */
export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages and actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {NAV_GROUPS.map((group, gi) => {
          const items = group.items.filter((it) => !it.perm || hasPermission(user, it.perm));
          if (items.length === 0) return null;
          return (
            <React.Fragment key={group.label ?? `g-${gi}`}>
              {gi > 0 && <CommandSeparator />}
              <CommandGroup heading={group.label ?? "General"}>
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)} className="gap-2">
                      <Icon className="size-4 text-muted-foreground" />
                      {item.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </React.Fragment>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
