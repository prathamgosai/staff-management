import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest and auto-linked by Next. Makes the app
// installable ("Add to Home Screen") and launchable standalone on Android/iOS.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BookendsShiftly",
    short_name: "BookendsShiftly",
    description: "Restaurant workforce management — schedules, attendance, leave and staff, on any device.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1020",
    theme_color: "#2563eb",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
