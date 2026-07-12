import { Injectable, Inject, Logger } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.constants";
import type { AuthUser } from "@workforceiq/shared";

export interface AuditEntry {
  /** Dotted verb, e.g. "transfer.approve", "leave.reject", "role.permissions.update". */
  action: string;
  /** The entity kind, e.g. "staff_transfer", "leave_request", "role". */
  entityType: string;
  entityId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Writes to the (previously dormant) audit_logs table so an HR system can answer
 * "who changed what, when". Deliberately FAIL-SAFE: a failed audit insert is logged
 * but never thrown, so it can't break the user action it is recording. Records are
 * written AFTER the action commits, so only real changes are logged.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger("Audit");
  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  /**
   * Read the audit trail for the caller's tenant, newest first. Tenant-scoped (never
   * crosses tenants) with optional filters + pagination. Backs the "who changed what" view.
   */
  async list(
    tenantId: string,
    filters: { action?: string; entityType?: string; entityId?: string; limit?: number; offset?: number },
  ) {
    const conditions = ["a.tenant_id = $1"];
    const params: unknown[] = [tenantId];
    let i = 2;
    if (filters.action) { conditions.push(`a.action = $${i++}`); params.push(filters.action); }
    if (filters.entityType) { conditions.push(`a.entity_type = $${i++}`); params.push(filters.entityType); }
    if (filters.entityId) { conditions.push(`a.entity_id = $${i++}`); params.push(filters.entityId); }
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const offset = Math.max(Number(filters.offset) || 0, 0);
    const res = await this.db.query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.old_values, a.new_values,
              a.created_at, a.user_id, u.name AS user_name, u.email AS user_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY a.created_at DESC
       LIMIT $${i++} OFFSET $${i}`,
      [...params, limit, offset],
    );
    return { data: res.rows };
  }

  async record(user: Pick<AuthUser, "id" | "tenantId">, entry: AuditEntry): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO audit_logs
           (tenant_id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          user.tenantId,
          user.id,
          entry.action,
          entry.entityType,
          entry.entityId ?? null,
          entry.oldValues != null ? JSON.stringify(entry.oldValues) : null,
          entry.newValues != null ? JSON.stringify(entry.newValues) : null,
          entry.ip ?? null,
          entry.userAgent ?? null,
        ],
      );
    } catch (e) {
      this.logger.warn(
        `audit write failed (${entry.action} ${entry.entityType} ${entry.entityId ?? ""}): ${(e as Error).message}`,
      );
    }
  }
}
