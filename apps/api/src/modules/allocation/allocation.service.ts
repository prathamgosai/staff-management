import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";

@Injectable()
export class AllocationService {
  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  async getTransfers(tenantId: string, filters: { status?: string; outletId?: string }) {
    const conditions = ["s.tenant_id = $1"];
    const params: unknown[] = [tenantId];
    let i = 2;

    if (filters.status) { conditions.push(`st.status = $${i++}`); params.push(filters.status); }
    if (filters.outletId) {
      conditions.push(`(st.from_outlet_id = $${i} OR st.to_outlet_id = $${i})`);
      params.push(filters.outletId);
      i++;
    }

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

  async requestTransfer(requestedBy: string, body: { staffId: string; fromOutletId: string; toOutletId: string; effectiveDate: string; endDate?: string; type?: string; reason?: string }) {
    const result = await this.db.query(
      `INSERT INTO staff_transfers (staff_id, from_outlet_id, to_outlet_id, type, effective_date, end_date, reason, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [body.staffId, body.fromOutletId, body.toOutletId, body.type ?? "temporary",
       body.effectiveDate, body.endDate ?? null, body.reason ?? null, requestedBy],
    );
    return { data: result.rows[0] };
  }

  async reviewTransfer(id: string, approverId: string, action: "approve" | "reject") {
    const status = action === "approve" ? "approved" : "rejected";
    const result = await this.db.query(
      `UPDATE staff_transfers SET status = $2, approved_by = $3, approved_at = NOW() WHERE id = $1 RETURNING *`,
      [id, status, approverId],
    );

    if (action === "approve") {
      const transfer = result.rows[0];
      await this.db.query(
        `UPDATE staff SET current_outlet_id = $2 WHERE id = $1`,
        [transfer.staff_id, transfer.to_outlet_id],
      );
    }

    return { data: result.rows[0] };
  }

  async getStaffingSuggestions(tenantId: string, outletId: string, date: string) {
    // Find available staff from other outlets (same tenant, not on leave, not scheduled)
    const result = await this.db.query(
      `SELECT s.id, s.name, s.employee_id, s.current_outlet_id,
              o.name AS current_outlet_name, p.name AS position_name
       FROM staff s
       JOIN outlets o ON o.id = s.current_outlet_id
       LEFT JOIN positions p ON p.id = s.position_id
       WHERE s.tenant_id = $1
         AND s.current_outlet_id != $2
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
      [tenantId, outletId, date],
    );
    return { data: result.rows };
  }
}
