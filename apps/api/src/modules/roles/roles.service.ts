import { Injectable, Inject, BadRequestException } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import {
  ROLES, ROLE_META, ROLE_PERMISSIONS, PERMISSION_CATALOG, ALL_PERMISSIONS,
  type Role,
} from "@workforceiq/shared";

// Every role except super_admin is editable. super_admin always implies "*".
const EDITABLE_ROLES = Object.values(ROLES).filter((r) => r !== ROLES.SUPER_ADMIN) as Role[];

@Injectable()
export class RolesService {
  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  /**
   * Effective permissions for a role, read from the editable matrix.
   * super_admin is hard-wired to ["*"] so it can never be locked out, and any
   * role with no rows yet falls back to the seeded ROLE_PERMISSIONS constant.
   * Consumed by the auth layer to stamp permissions onto the request user.
   */
  async getPermissionsForRole(tenantId: string, role: Role | string): Promise<string[]> {
    if (role === ROLES.SUPER_ADMIN) return ["*"];
    const res = await this.db.query(
      "SELECT permission FROM role_permissions WHERE tenant_id = $1 AND role = $2::user_role",
      [tenantId, role],
    );
    if (res.rows.length > 0) return res.rows.map((r) => r.permission as string);
    return ROLE_PERMISSIONS[role as Role] ?? [];
  }

  /** The users assigned to a given account type (name/email/employee id). */
  async getUsersForRole(tenantId: string, role: string) {
    if (!(Object.values(ROLES) as string[]).includes(role)) {
      throw new BadRequestException(`Unknown account type: ${role}`);
    }
    const res = await this.db.query(
      `SELECT u.id, u.name, u.email, u.is_active, s.employee_id
       FROM users u
       LEFT JOIN staff s ON s.user_id = u.id
       WHERE u.tenant_id = $1 AND u.role = $2::user_role
       ORDER BY u.name`,
      [tenantId, role],
    );
    return { data: res.rows };
  }

  /**
   * The full picture the Account Types page renders: the permission catalogue
   * plus, for every role, its current permissions and how many users hold it.
   */
  async getMatrix(tenantId: string) {
    const [permRes, countRes] = await Promise.all([
      this.db.query(
        "SELECT role, permission FROM role_permissions WHERE tenant_id = $1",
        [tenantId],
      ),
      this.db.query(
        "SELECT role, COUNT(*)::int AS count FROM users WHERE tenant_id = $1 GROUP BY role",
        [tenantId],
      ),
    ]);

    const permsByRole = new Map<string, string[]>();
    for (const row of permRes.rows) {
      const list = permsByRole.get(row.role) ?? [];
      list.push(row.permission);
      permsByRole.set(row.role, list);
    }
    const countByRole = new Map<string, number>();
    for (const row of countRes.rows) countByRole.set(row.role, row.count);

    const roles = (Object.values(ROLES) as Role[])
      .map((role) => {
        const isSuper = role === ROLES.SUPER_ADMIN;
        const stored = permsByRole.get(role);
        return {
          role,
          label: ROLE_META[role].label,
          description: ROLE_META[role].description,
          hierarchy: ROLE_META[role].hierarchy,
          userCount: countByRole.get(role) ?? 0,
          editable: !isSuper,
          // super_admin shows every permission (locked); others use stored rows,
          // falling back to the seeded defaults if none have been saved yet.
          permissions: isSuper
            ? ALL_PERMISSIONS
            : (stored ?? ROLE_PERMISSIONS[role] ?? []),
        };
      })
      .sort((a, b) => b.hierarchy - a.hierarchy);

    return { data: { catalog: PERMISSION_CATALOG, roles } };
  }

  /** Replace a role's permission set. super_admin is immutable; keys are validated. */
  async updateRolePermissions(tenantId: string, role: string, permissions: string[]) {
    if (role === ROLES.SUPER_ADMIN) {
      throw new BadRequestException("Super Admin always has full access and cannot be edited.");
    }
    if (!EDITABLE_ROLES.includes(role as Role)) {
      throw new BadRequestException(`Unknown account type: ${role}`);
    }
    if (!Array.isArray(permissions)) {
      throw new BadRequestException("permissions must be an array of permission keys.");
    }

    // De-dupe and reject anything outside the catalogue.
    const unique = [...new Set(permissions)];
    const invalid = unique.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (invalid.length > 0) {
      throw new BadRequestException(`Unknown permission(s): ${invalid.join(", ")}`);
    }

    const client = await (this.db as Pool & { connect(): Promise<{ query: Pool["query"]; release(): void }> }).connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM role_permissions WHERE tenant_id = $1 AND role = $2::user_role",
        [tenantId, role],
      );
      for (const permission of unique) {
        await client.query(
          "INSERT INTO role_permissions (tenant_id, role, permission) VALUES ($1, $2::user_role, $3)",
          [tenantId, role, permission],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      (client as { release(): void }).release();
    }

    return { data: { role, permissions: unique } };
  }
}
