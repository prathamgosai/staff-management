import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Pool } from "pg";
import {
  allowedOutletIds,
  resolveOutletFilter,
  assertOutletAllowed,
  assertOutletInScope,
  assertStaffInScope,
} from "./outlet-scope";
import type { AuthUser } from "@workforceiq/shared";

// Minimal AuthUser factory for the scope tests.
const user = (role: string, outletIds: string[] = [], tenantId = "t1"): AuthUser =>
  ({ id: "u1", email: "u@x", role, outletIds, tenantId, name: "", permissions: [] }) as unknown as AuthUser;

const OUTLET_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OUTLET_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

// A pg Pool test double whose query() returns whatever we queue, and records calls.
function mockPool(rows: unknown[]): { db: Pool; calls: { sql: string; params: unknown[] }[] } {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    query: (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows });
    },
  } as unknown as Pool;
  return { db, calls };
}

describe("outlet-scope", () => {
  describe("allowedOutletIds", () => {
    it("returns null (all outlets) for admin roles", () => {
      expect(allowedOutletIds(user("admin"))).toBeNull();
      expect(allowedOutletIds(user("hr"))).toBeNull();
      expect(allowedOutletIds(user("super_admin"))).toBeNull();
    });
    it("returns the user's outlets for scoped roles", () => {
      expect(allowedOutletIds(user("head_of_house", [OUTLET_A]))).toEqual([OUTLET_A]);
    });
    it("returns [] (nothing) for a scoped user with no outlets", () => {
      expect(allowedOutletIds(user("head_of_house", []))).toEqual([]);
    });
  });

  describe("resolveOutletFilter", () => {
    it("passes an in-scope requested outlet through", () => {
      expect(resolveOutletFilter(user("head_of_house", [OUTLET_A]), OUTLET_A)).toEqual([OUTLET_A]);
    });
    it("REJECTS an out-of-scope requested outlet (403)", () => {
      expect(() => resolveOutletFilter(user("head_of_house", [OUTLET_A]), OUTLET_B)).toThrow(ForbiddenException);
    });
    it("lets an admin request any outlet", () => {
      expect(resolveOutletFilter(user("admin"), OUTLET_B)).toEqual([OUTLET_B]);
    });
    it("falls back to full scope when no outlet is requested", () => {
      expect(resolveOutletFilter(user("head_of_house", [OUTLET_A]))).toEqual([OUTLET_A]);
      expect(resolveOutletFilter(user("admin"))).toBeNull();
    });
  });

  describe("assertOutletAllowed", () => {
    it("throws 403 when a scoped user targets an outlet they don't manage", () => {
      expect(() => assertOutletAllowed(user("head_of_house", [OUTLET_A]), OUTLET_B)).toThrow(ForbiddenException);
    });
    it("allows a scoped user's own outlet, and any outlet for admins", () => {
      expect(() => assertOutletAllowed(user("head_of_house", [OUTLET_A]), OUTLET_A)).not.toThrow();
      expect(() => assertOutletAllowed(user("admin"), OUTLET_B)).not.toThrow();
    });
  });

  describe("assertOutletInScope (DB-backed)", () => {
    it("passes the tenant + scope into the query and resolves when a row is returned", async () => {
      const { db, calls } = mockPool([{ "?column?": 1 }]);
      await expect(assertOutletInScope(db, user("head_of_house", [OUTLET_A]), OUTLET_A)).resolves.toBeUndefined();
      expect(calls[0].params).toEqual([OUTLET_A, "t1", [OUTLET_A]]);
    });
    it("throws 404 when no row matches (cross-tenant / out-of-scope)", async () => {
      const { db } = mockPool([]);
      await expect(assertOutletInScope(db, user("head_of_house", [OUTLET_A]), OUTLET_B)).rejects.toThrow(NotFoundException);
    });
    it("passes null scope for admins (tenant check only)", async () => {
      const { db, calls } = mockPool([{ "?column?": 1 }]);
      await assertOutletInScope(db, user("admin"), OUTLET_B);
      expect(calls[0].params).toEqual([OUTLET_B, "t1", null]);
    });
  });

  describe("assertStaffInScope (DB-backed)", () => {
    it("scopes by tenant + outlet and 404s when the staff member is out of scope", async () => {
      const { db } = mockPool([]);
      await expect(assertStaffInScope(db, user("head_of_house", [OUTLET_A]), "staff-1")).rejects.toThrow(NotFoundException);
    });
    it("passes tenant + scope params and resolves when found", async () => {
      const { db, calls } = mockPool([{ "?column?": 1 }]);
      await assertStaffInScope(db, user("head_of_house", [OUTLET_A]), "staff-1");
      expect(calls[0].params).toEqual(["staff-1", "t1", [OUTLET_A]]);
    });
  });
});
