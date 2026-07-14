import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "./providers";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { InstallHint } from "@/components/pwa/install-hint";

// NOTE: the UI font is a LOCAL/system stack (see --font-sans in globals.css) — NOT fetched from
// Google Fonts. Fetching Inter from fonts.googleapis.com at build/compile time hung the dev
// server (33s compiles) and could break the Render build on restricted networks. Systems with
// Inter installed still use it; others fall back to the native system font.

export const metadata: Metadata = {
  title: "BookendsShiftly — Restaurant Workforce Management",
  description: "AI-powered workforce planning and operations management for multi-outlet restaurant groups",
  applicationName: "BookendsShiftly",
  // Served as a STATIC file from /public (not a generated app/manifest.ts route) so the
  // Next 14.2 dev server can't 500 while compiling a metadata route. Link it manually.
  manifest: "/manifest.webmanifest",
  // Lets iOS/Android treat an installed instance as a standalone app.
  appleWebApp: { capable: true, statusBarStyle: "default", title: "BookendsShiftly" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

// Next 14 wants viewport/themeColor in their own export, not in metadata.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  // Let content extend under the notch; paired with env(safe-area-inset-*) in CSS.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Locale + catalog are resolved on the server from the `wfiq-locale` cookie
  // (see src/i18n/request.ts). Passing them to NextIntlClientProvider makes
  // useTranslations() work in every client component without a per-page fetch.
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen overflow-x-hidden bg-background font-sans text-foreground antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
          <ServiceWorkerRegister />
          <InstallHint />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
