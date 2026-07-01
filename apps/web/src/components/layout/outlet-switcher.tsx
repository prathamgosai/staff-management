"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, ChevronsUpDown, Store } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { useUiStore } from "@/store/ui.store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

interface Outlet {
  id: string;
  name: string;
  brand_name?: string;
}

/**
 * Multi-brand context switcher. Persists the choice to the UI store so screens
 * can read `selectedOutletId` as a global filter. Does not alter any existing
 * per-page data fetching — screens opt in during their own refactor.
 */
export function OutletSwitcher() {
  const [open, setOpen] = React.useState(false);
  const selectedOutletId = useUiStore((s) => s.selectedOutletId);
  const setSelectedOutletId = useUiStore((s) => s.setSelectedOutletId);

  const { data } = useQuery<{ data: Outlet[] }>({
    queryKey: ["outlets"],
    queryFn: () => apiClient.get("/outlets").then((r) => r.data),
  });
  const outlets = data?.data ?? [];
  const selected = outlets.find((o) => o.id === selectedOutletId) ?? null;

  // Group by brand for the list.
  const byBrand = new Map<string, Outlet[]>();
  for (const o of outlets) {
    const brand = o.brand_name || "Outlets";
    if (!byBrand.has(brand)) byBrand.set(brand, []);
    byBrand.get(brand)!.push(o);
  }

  function choose(id: string | null) {
    setSelectedOutletId(id);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Switch outlet"
          className="h-9 max-w-[15rem] justify-between gap-2 font-normal"
        >
          <Building2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-col items-start leading-none">
            <span className="truncate text-sm font-medium">{selected ? selected.name : "All outlets"}</span>
            {selected?.brand_name && (
              <span className="truncate text-xs text-muted-foreground">{selected.brand_name}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search outlet…" />
          <CommandList>
            <CommandEmpty>No outlet found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="all outlets" onSelect={() => choose(null)} className="gap-2">
                <Store className="size-4 text-muted-foreground" />
                <span className="flex-1">All outlets</span>
                {selectedOutletId === null && <Check className="size-4 text-primary" />}
              </CommandItem>
            </CommandGroup>
            {Array.from(byBrand.entries()).map(([brand, list]) => (
              <CommandGroup key={brand} heading={brand}>
                {list.map((o) => (
                  <CommandItem key={o.id} value={`${brand} ${o.name}`} onSelect={() => choose(o.id)} className="gap-2">
                    <Building2 className="size-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{o.name}</span>
                    {selectedOutletId === o.id && <Check className={cn("size-4 text-primary")} />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
