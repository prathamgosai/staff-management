import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";

/**
 * Focused unit tests for the security-critical refresh-token rotation.
 * The DB pool and JWT service are mocked; we assert on the SQL the service runs.
 */
type QueryImpl = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;

function makeService(queryImpl: QueryImpl) {
  const calls: string[] = [];
  const db = {
    query: jest.fn((sql: string, params?: unknown[]) => {
      calls.push(sql);
      return queryImpl(sql, params);
    }),
  };
  const jwt = {
    verify: jest.fn(() => ({ sub: "u1", email: "a@b.c", role: "super_admin", tenantId: "t1", outletIds: [] })),
    decode: jest.fn(() => ({ exp: Math.floor(Date.now() / 1000) + 3600 })),
    signAsync: jest.fn(async (payload: object) => `signed.${JSON.stringify(payload).length}`),
  };
  const config = { get: jest.fn((_k: string, d?: unknown) => d) };
  const roles = { getPermissionsForRole: jest.fn(async () => ["*"]) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = new AuthService(db as any, jwt as any, config as any, roles as any);
  return { svc, calls };
}

describe("AuthService refresh-token rotation", () => {
  it("rejects a refresh token that has no live row (reuse / already rotated)", async () => {
    const { svc } = makeService(async (sql) => {
      if (sql.includes("FROM refresh_tokens")) return { rows: [] }; // no matching live token
      return { rows: [] };
    });
    await expect(svc.refreshTokens("stale-token")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("revokes the used token and issues + stores a new one", async () => {
    const { svc, calls } = makeService(async (sql) => {
      if (sql.includes("SELECT id FROM refresh_tokens")) return { rows: [{ id: "rt1" }] };
      if (sql.startsWith("SELECT * FROM users")) {
        return { rows: [{ id: "u1", email: "a@b.c", role: "super_admin", tenant_id: "t1", outlet_ids: [] }] };
      }
      return { rows: [] };
    });

    const tokens = await svc.refreshTokens("good-token");

    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
    expect(calls.some((s) => s.includes("UPDATE refresh_tokens SET revoked_at"))).toBe(true);
    expect(calls.some((s) => s.includes("INSERT INTO refresh_tokens"))).toBe(true);
  });
});
