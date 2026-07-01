"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Wraps next-themes. `attribute="class"` toggles the `.dark` class on <html>,
 * which drives the design tokens in globals.css. System preference is detected
 * and the choice is persisted; transitions are disabled on change to avoid flash.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
