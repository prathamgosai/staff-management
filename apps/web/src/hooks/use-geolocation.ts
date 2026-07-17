export type GeoReading =
  | { kind: "ok"; lat: number; lng: number; accuracy: number }
  | { kind: "denied" }
  | { kind: "unavailable"; message: string }
  | { kind: "insecure" };

/**
 * Ask the browser for a fresh position, once.
 *
 * Shared by the staff self-punch page and the manager's Mark Attendance modal so both
 * request location the same way and interpret failure the same way.
 *
 * Never throws: every failure is a returned state the caller can render. A thrown
 * permission error would otherwise surface as a generic "something went wrong", which tells
 * the user nothing about the padlock icon they need to click.
 */
export function requestGeolocation(): Promise<GeoReading> {
  return new Promise((resolve) => {
    // getCurrentPosition only exists on a secure origin. Over plain HTTP on a LAN address
    // the API is simply absent, and no prompt can ever appear — worth saying out loud
    // rather than looking broken.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      resolve({ kind: "insecure" });
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ kind: "unavailable", message: "This device can't report a location." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ kind: "ok", lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => resolve(
        err.code === err.PERMISSION_DENIED
          ? { kind: "denied" }
          : { kind: "unavailable", message: err.message || "Couldn't get a location fix." },
      ),
      // maximumAge: 0 — a cached fix from hours ago would place someone at the restaurant
      // long after they left, which is exactly what this check exists to catch.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

/** The GPS fields the API expects, or {} when no fix was obtained. */
export function geoToBody(g: GeoReading): { gpsLat?: number; gpsLng?: number; gpsAccuracyM?: number } {
  return g.kind === "ok" ? { gpsLat: g.lat, gpsLng: g.lng, gpsAccuracyM: g.accuracy } : {};
}

/** One sentence explaining a failed reading, for display next to the action. */
export function geoMessage(g: GeoReading): string | null {
  switch (g.kind) {
    case "ok": return null;
    case "denied": return "Location is blocked. Tap the padlock in the address bar, allow Location, then reload.";
    case "insecure": return "Location needs an https:// address — browsers won't share it over plain HTTP.";
    case "unavailable": return g.message;
  }
}
