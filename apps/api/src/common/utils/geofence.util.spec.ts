import { haversineMeters, evaluateGeofence, DEFAULT_MAX_ACCURACY_M } from "./geofence.util";
import type { Pool } from "pg";

/** Minimal Pool stub — evaluateGeofence only ever SELECTs. */
function dbStub(outlet: Record<string, unknown> | null, maxAccuracy: number | null = DEFAULT_MAX_ACCURACY_M) {
  return {
    query: jest.fn(async (sql: string) => {
      if (sql.includes("FROM outlets")) return { rows: outlet ? [outlet] : [] };
      if (sql.includes("tenant_settings")) return { rows: maxAccuracy == null ? [] : [{ value: maxAccuracy }] };
      return { rows: [] };
    }),
  } as unknown as Pool;
}

// Capiche Ambli, Ahmedabad — a real-ish city coordinate, so the maths is exercised at the
// latitude these restaurants actually sit at.
const OUTLET = { latitude: 23.0225, longitude: 72.5714, geofence_radius_m: 150 };
const T = "tenant-1";

describe("haversineMeters", () => {
  it("is zero for the same point", () => {
    expect(haversineMeters(23.0225, 72.5714, 23.0225, 72.5714)).toBe(0);
  });

  it("matches a known distance (1 degree of latitude ~= 111km)", () => {
    const d = haversineMeters(23.0, 72.5714, 24.0, 72.5714);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("is symmetric", () => {
    const a = haversineMeters(23.0225, 72.5714, 23.03, 72.58);
    const b = haversineMeters(23.03, 72.58, 23.0225, 72.5714);
    expect(Math.abs(a - b)).toBeLessThan(0.001);
  });

  it("resolves short, in-radius distances (~100m)", () => {
    // ~0.0009 degrees of latitude ~= 100m
    const d = haversineMeters(23.0225, 72.5714, 23.0234, 72.5714);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(110);
  });

  it("handles the antimeridian without NaN", () => {
    const d = haversineMeters(0, 179.999, 0, -179.999);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeLessThan(1_000);
  });
});

describe("evaluateGeofence", () => {
  it("approves a punch inside the radius with good accuracy", async () => {
    const v = await evaluateGeofence(dbStub(OUTLET), T, {
      outletId: "o1", lat: 23.0227, lng: 72.5716, accuracyM: 12, source: "self",
    });
    expect(v.status).toBe("approved");
    expect(v.distanceM).toBeLessThan(150);
  });

  it("sends an out-of-radius punch to review, never straight to rejected", async () => {
    // ~2km away
    const v = await evaluateGeofence(dbStub(OUTLET), T, {
      outletId: "o1", lat: 23.04, lng: 72.59, accuracyM: 10, source: "self",
    });
    expect(v.status).toBe("pending_review");
    expect(v.reason).toContain("Outside");
    expect(v.distanceM).toBeGreaterThan(150);
  });

  it("reviews a punch whose accuracy is worse than the limit, even if it looks inside", async () => {
    const v = await evaluateGeofence(dbStub(OUTLET), T, {
      outletId: "o1", lat: 23.0227, lng: 72.5716, accuracyM: 500, source: "self",
    });
    expect(v.status).toBe("pending_review");
    expect(v.reason).toContain("accuracy");
    // Distance still reported, so a manager can see how far the reading claimed to be.
    expect(v.distanceM).not.toBeNull();
  });

  it("reviews a self punch with no location — that is what punching from home looks like", async () => {
    const v = await evaluateGeofence(dbStub(OUTLET), T, {
      outletId: "o1", lat: null, lng: null, accuracyM: null, source: "self",
    });
    expect(v.status).toBe("pending_review");
    expect(v.reason).toBe("Missing location data");
  });

  it("does NOT punish a kiosk punch for having no GPS — the kiosk is on-site by definition", async () => {
    const v = await evaluateGeofence(dbStub(OUTLET), T, {
      outletId: "o1", lat: null, lng: null, accuracyM: null, source: "kiosk",
    });
    expect(v.status).toBe("not_evaluated");
    expect(v.distanceM).toBeNull();
  });

  it("does not evaluate when the outlet has no coordinates — the state every outlet starts in", async () => {
    const v = await evaluateGeofence(dbStub({ latitude: null, longitude: null, geofence_radius_m: 150 }), T, {
      outletId: "o1", lat: 23.0227, lng: 72.5716, accuracyM: 10, source: "self",
    });
    expect(v.status).toBe("not_evaluated");
    expect(v.reason).toBe("Outlet location not set");
  });

  it("does not evaluate for an unknown outlet", async () => {
    const v = await evaluateGeofence(dbStub(null), T, {
      outletId: "nope", lat: 23.0227, lng: 72.5716, accuracyM: 10, source: "self",
    });
    expect(v.status).toBe("not_evaluated");
  });

  it("honours a per-outlet radius, so a mall unit can be wider than a cafe", async () => {
    // ~1.2km out: outside a default 150m fence, inside a 2000m one (the schema's cap).
    const far = { lat: 23.03, lng: 72.58, accuracyM: 10, source: "self" as const, outletId: "o1" };
    expect((await evaluateGeofence(dbStub(OUTLET), T, far)).status).toBe("pending_review");
    expect((await evaluateGeofence(dbStub({ ...OUTLET, geofence_radius_m: 2000 }), T, far)).status).toBe("approved");
  });

  it("falls back to the default accuracy limit when the tenant setting is absent", async () => {
    const v = await evaluateGeofence(dbStub(OUTLET, null), T, {
      outletId: "o1", lat: 23.0227, lng: 72.5716, accuracyM: DEFAULT_MAX_ACCURACY_M + 1, source: "self",
    });
    expect(v.status).toBe("pending_review");
  });

  it("ignores a client-supplied verdict — the client only ever sends readings", async () => {
    const v = await evaluateGeofence(dbStub(OUTLET), T, {
      outletId: "o1", lat: 23.04, lng: 72.59, accuracyM: 10, source: "self",
      // @ts-expect-error deliberately smuggling an approval the client does not get to make
      status: "approved", geo_status: "approved",
    });
    expect(v.status).toBe("pending_review");
  });
});
