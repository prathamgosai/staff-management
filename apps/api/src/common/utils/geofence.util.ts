import { Pool } from "pg";

/**
 * Server-side geofence evaluation for attendance punches.
 *
 * Every input here is attacker-controlled: latitude, longitude and accuracy all come from
 * the client, and browser GPS is trivially spoofable with devtools or a fake-GPS app. This
 * check raises the effort to cheat; it does not prevent it. What it MUST do is never let
 * the client hand us a verdict — only raw readings. The decision is made here, against
 * coordinates stored on the outlet.
 */

/** Fallback when the tenant has no `gps_max_accuracy_m` row (or 029 isn't applied). */
export const DEFAULT_MAX_ACCURACY_M = 50;

export type GeoStatus = "approved" | "pending_review" | "rejected" | "not_evaluated";

export interface GeoVerdict {
  status: GeoStatus;
  /** Short, human-readable — shown to the punching staff member and to the reviewing manager. */
  reason: string;
  /** Metres from the outlet, or null when no distance could be computed. */
  distanceM: number | null;
  accuracyM: number | null;
}

export interface GeoInput {
  outletId: string;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  /** 'kiosk' punches are on-site by definition; 'self' punches are from a personal device. */
  source: "kiosk" | "self";
}

/**
 * Great-circle distance in metres. Haversine — accurate to ~0.5%, which is far tighter than
 * consumer GPS error (5-50m) at the scale of a 150m radius, so a more expensive geodesic
 * formula would add precision the input can't justify.
 */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_008.8; // IUGG mean Earth radius, metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export async function getMaxAccuracyM(db: Pool, tenantId: string): Promise<number> {
  try {
    const r = await db.query(
      "SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = 'gps_max_accuracy_m'",
      [tenantId],
    );
    const v = Number(r.rows[0]?.value);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_MAX_ACCURACY_M;
  } catch {
    return DEFAULT_MAX_ACCURACY_M; // tenant_settings not migrated yet
  }
}

const isCoord = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Decide whether a punch happened at the outlet.
 *
 * Deliberately never returns 'rejected': an automated reading does not get to deny someone
 * a day's pay. Out-of-radius and untrustworthy readings become 'pending_review' for a
 * manager, who is the only actor that can reject. Kitchens have thick walls and indoor
 * fixes are routinely 30-100m off — a hard reject would punish bad signal, not bad faith.
 */
export async function evaluateGeofence(
  db: Pool,
  tenantId: string,
  input: GeoInput,
): Promise<GeoVerdict> {
  const { outletId, lat, lng, accuracyM, source } = input;
  const acc = isCoord(accuracyM) ? accuracyM : null;

  const res = await db.query(
    "SELECT latitude, longitude, geofence_radius_m FROM outlets WHERE id = $1 AND tenant_id = $2",
    [outletId, tenantId],
  );
  const outlet = res.rows[0];

  // Outlet never surveyed — the geofence cannot be evaluated. Say so rather than guessing;
  // this is the state every outlet starts in.
  if (!outlet || outlet.latitude == null || outlet.longitude == null) {
    return { status: "not_evaluated", reason: "Outlet location not set", distanceM: null, accuracyM: acc };
  }

  if (!isCoord(lat) || !isCoord(lng)) {
    // A kiosk stands inside the restaurant, so a missing fix there is expected and proves
    // nothing either way. On a personal device, a missing fix is exactly what someone
    // punching from home would send — that needs a human look.
    return source === "kiosk"
      ? { status: "not_evaluated", reason: "Kiosk punch — location not captured", distanceM: null, accuracyM: acc }
      : { status: "pending_review", reason: "Missing location data", distanceM: null, accuracyM: acc };
  }

  const distanceM = Math.round(haversineMeters(lat, lng, Number(outlet.latitude), Number(outlet.longitude)) * 100) / 100;
  const radius = Number(outlet.geofence_radius_m);

  // Accuracy gate runs AFTER distance so the manager still sees how far away the reading
  // claimed to be — "outside by 3km with 80m accuracy" reads very differently from
  // "inside with 80m accuracy".
  const maxAccuracy = await getMaxAccuracyM(db, tenantId);
  if (acc == null || acc > maxAccuracy) {
    return {
      status: "pending_review",
      reason: acc == null
        ? "GPS accuracy not reported"
        : `GPS accuracy too low (${Math.round(acc)}m, limit ${maxAccuracy}m)`,
      distanceM,
      accuracyM: acc,
    };
  }

  if (distanceM <= radius) {
    return { status: "approved", reason: `Within ${radius}m of the outlet (${Math.round(distanceM)}m)`, distanceM, accuracyM: acc };
  }
  return {
    status: "pending_review",
    reason: `Outside the ${radius}m radius (${Math.round(distanceM)}m away)`,
    distanceM,
    accuracyM: acc,
  };
}
