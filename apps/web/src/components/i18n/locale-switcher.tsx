"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { Globe } from "lucide-react";

// Keep in sync with src/i18n/request.ts LOCALES.
const LOCALES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "gu", label: "ગુજરાતી" },
  { code: "hi", label: "हिन्दी" },
];
const LOCALE_COOKIE = "wfiq-locale";

// Cookie-based locale switch (no URL routing). Writing the cookie + reloading
// lets the server re-render every route in the chosen language via next-intl.
export function LocaleSwitcher() {
  const active = useLocale();
  const [pending, startTransition] = useTransition();

  function setLocale(code: string) {
    if (code === active) return;
    // 1 year, site-wide.
    document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    startTransition(() => {
      // Full reload so server components pick up the new cookie.
      window.location.reload();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Globe className="h-4 w-4 text-muted-foreground" aria-hidden />
      <div className="flex gap-1" role="group" aria-label="Language">
        {LOCALES.map((l) => (
          <button
            key={l.code}
            type="button"
            disabled={pending}
            onClick={() => setLocale(l.code)}
            className={`rounded-md border px-3 py-1.5 text-sm transition disabled:opacity-60 ${
              l.code === active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-foreground hover:bg-accent"
            }`}
            aria-pressed={l.code === active}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
