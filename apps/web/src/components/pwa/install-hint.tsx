"use client";

import { useEffect, useState } from "react";
import { X, Download, Share } from "lucide-react";

const DISMISS_KEY = "bookendsshiftly-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * A small, dismissible "Install app" hint. On Android/desktop it captures the
 * `beforeinstallprompt` event and offers a one-tap install; on iOS Safari (which has
 * no such event) it shows the "Share -> Add to Home Screen" instruction instead.
 * Hidden once installed/standalone, and remembered as dismissed via localStorage.
 */
export function InstallHint() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* private mode — just proceed */
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return; // already installed

    const ua = window.navigator.userAgent;
    const iOS = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua); // Safari on iOS only
    if (iOS) {
      setIsIOS(true);
      setVisible(true);
      return;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // stop Chrome's default mini-infobar; we show our own
      setPromptEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => setVisible(false);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice.catch(() => undefined);
    setPromptEvent(null);
    dismiss();
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-border bg-popover p-4 shadow-pop sm:inset-x-auto sm:right-4">
      <button
        onClick={dismiss}
        aria-label="Dismiss install hint"
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          <Download className="size-5" />
        </span>
        {isIOS ? (
          <div className="text-sm">
            <p className="font-semibold text-foreground">Install BookendsShiftly</p>
            <p className="mt-0.5 text-muted-foreground">
              Tap the Share <Share className="inline size-3.5 align-text-bottom" /> button, then
              <span className="font-medium text-foreground"> “Add to Home Screen”</span>.
            </p>
          </div>
        ) : (
          <div className="flex-1 text-sm">
            <p className="font-semibold text-foreground">Install BookendsShiftly</p>
            <p className="mt-0.5 text-muted-foreground">Add the app to your device for quick, full-screen access.</p>
            <div className="mt-2.5 flex gap-2">
              <button
                onClick={install}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Install
              </button>
              <button
                onClick={dismiss}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted"
              >
                Not now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
