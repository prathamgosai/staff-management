import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import {
  allowedOutletIds,
  assertOutletAllowed,
  assertStaffInScope,
  resolveOutletFilter,
} from "../../common/auth/outlet-scope";
import type { AuthUser } from "@workforceiq/shared";

@Injectable()
export class AllocationService {
  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  async getTransfers(user: AuthUser, filters: { status?: string; outletId?: string }) {
    // resolveOutletFilter rejects an out-of-scope outletId (403) and otherwise
    // returns the caller's full allowed scope (null = admin/all outlets).
    const scope = resolveOutletFilter(user, filters.outletId);
    const conditions = ["s.tenant_id = $1", "($2::uuid[] IS NULL OR st.from_outlet_id = ANY($2) OR st.to_outlet_id = ANY($2))"];
    const params: unknown[] = [user.tenantId, scope];
    let i = 3;

    if (filters.status) { conditions.push(`st.status = $${i++}`); params.push(filters.status); }

    const result = await this.db.query(
      `SELECT st.*, s.name AS staff_name, s.employee_id,
              fo.name AS from_outlet_name, to_o.name AS to_outlet_name
       FROM staff_transfers st
       JOIN staff s ON s.id = st.staff_id
       JOIN outlets fo ON fo.id = st.from_outlet_id
       JOIN outlets to_o ON to_o.id = st.to_outlet_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY st.created_at DESC`,
      params,
    );
    return { data: result.rows };
  }

  async requestTransfer(
    user: AuthUser,
    body: { staffId: string; fromOutletId: string; toOutletId: string; effectiveDate: string; endDate?: string; type?: string; reason?: string },
  ) {
    // The staff member (hence the from-outlet) must be within the requester's scope;
    // the destination is validated at approval time by whoever reviews it.
    await assertStaffInScope(this.db, user, body.staffId);
    const result = await this.db.query(
      `INSERT INTO staff_transfers (staff_id, from_outlet_id, to_outlet_id, type, effective_date, end_date, reason, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [body.staffId, body.fromOutletId, body.toOutletId, body.type ?? "temporary",
       body.effectiveDate, body.endDate ?? null, body.reason ?? null, user.id],
    );
    return { data: result.rows[0] };
  }

  async reviewTransfer(user: AuthUser, id: string, action: "approve" | "reject") {
    const status = action === "approve" ? "approved" : "rejected";
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      // Fetch + row-lock the transfer, scoped to the caller's tenant. 404 (not 403) so a
      // cross-tenant id can't be probed for existence.
      const cur = await client.query(
        `SELECT st.id, st.staff_id, st.from_outlet_id, st.to_outlet_id, s.tenant_id
         FROM staff_transfers st
         JOIN staff s ON s.id = st.staff_id
         WHERE st.id = $1 AND s.tenant_id = $2
         FOR UPDATE OF st`,
        [id, user.tenantId],
      );
      const transfer = cur.rows[0];
      if (!transfer) throw new NotFoundException("Transfer not found");
      // A scoped reviewer (head_of_house) must manage BOTH ends of the move; admins/hr
      // have null scope and pass. This is what previously let ANY logged-in user relocate
      // ANY staff member between ANY two outlets.
      assertOutletAllowed(user, transfer.from_outlet_id);
      assertOutletAllowed(user, transfer.to_outlet_id);

      const updated = await client.query(
        `UPDATE staff_transfers SET status = $2, approved_by = $3, approved_at = NOW() WHERE id = $1 RETURNING *`,
        [id, status, user.id],
      );
      if (action === "approve") {
        // Same transaction as the status write, so the row can never be marked approved
        // without the staff move actually landing (or vice-versa).
        await client.query(
          `UPDATE staff SET current_outlet_id = $2 WHERE id = $1 AND tenant_id = $3`,
          [transfer.staff_id, transfer.to_outlet_id, user.tenantId],
        );
      }
      await client.query("COMMIT");
      return { data: updated.rows[0] };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async getStaffingSuggestions(user: AuthUser, outletId: string, date: string) {
    // The target outlet must be one the caller can see.
    assertOutletAllowed(user, outletId);
    const scope = allowedOutletIds(user);
    // Find available staff from OTHER outlets within the caller's scope (same tenant,
    // not on leave, not scheduled that day).
    const result = await this.db.query(
      `SELECT s.id, s.name, s.employee_id, s.current_outlet_id,
              o.name AS current_outlet_name, p.name AS position_name
       FROM staff s
       JOIN outlets o ON o.id = s.current_outlet_id
       LEFT JOIN positions p ON p.id = s.position_id
       WHERE s.tenant_id = $1
         AND s.current_outlet_id != $2
         AND ($4::uuid[] IS NULL OR s.current_outlet_id = ANY($4))
         AND s.employment_status = 'active'
         AND s.id NOT IN (
           SELECT staff_id FROM leave_requests
           WHERE status = 'approved' AND $3 BETWEEN start_date AND end_date
         )
         AND s.id NOT IN (
           SELECT sa.staff_id FROM shift_assignments sa
           JOIN schedule_shifts ss ON ss.id = sa.shift_id
           WHERE ss.date = $3 AND sa.status != 'cancelled'
         )
       ORDER BY o.name, s.name
       LIMIT 20`,
      [user.tenantId, outletId, date, scope],
    );
    return { data: result.rows };
  }
}
