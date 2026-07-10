import { Injectable, Inject, NotFoundException, BadRequestException } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { allowedOutletIds } from "../../common/auth/outlet-scope";
import { istTodayStr } from "../../common/utils/date.util";
import type { AuthUser } from "@workforceiq/shared";
import { StaffingService } from "../staffing/staffing.service";
import { matchTransfers, OutletRoleVariance } from "./transfer-matcher";

/**
 * Intelligent Transfer Recommendations (Feature 6). Consumes the staffing engine's per-outlet,
 * per-role surplus/shortage, runs the pure greedy matcher (scorer chain), and PERSISTS scored
 * recommendations with a status lifecycle. Regeneration is idempotent (a partial unique index
 * keeps at most one PENDING rec per from→to→role). Accepting deep-links into the existing
 * /allocation transfer flow — no transfer logic is duplicated here.
 */
@Injectable()
export class TransferRecommendationsService {
  constructor(
    @Inject(DB_POOL) private readonly db: Pool,
    private readonly staffing: StaffingService,
  ) {}

  async regenerate(user: AuthUser) {
    const results = await this.staffing.buildResults(user.tenantId, allowedOutletIds(user), istTodayStr());
    const variances: OutletRoleVariance[] = [];
    for (const o of results) {
      for (const r of o.result.roles) {
        if (r.excess > 0 || r.shortage > 0) {
          variances.push({
            outletId: o.outletId, outletName: o.name,
            positionId: r.positionId, positionName: r.positionName ?? "Role",
            excess: r.excess, shortage: r.shortage,
          });
        }
      }
    }
    const recs = matchTransfers(variances);

    let created = 0;
    for (const rec of recs) {
      const res = await this.db.query(
        `INSERT INTO transfer_recommendations
           (tenant_id, from_outlet_id, to_outlet_id, position_id, headcount, confidence, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (from_outlet_id, to_outlet_id, position_id) WHERE status = 'pending' AND deleted_at IS NULL
         DO NOTHING`,
        [user.tenantId, rec.fromOutletId, rec.toOutletId, rec.positionId, rec.headcount, rec.confidence, rec.reason],
      );
      created += res.rowCount ?? 0;
    }
    const list = await this.list(user, "pending");
    return { data: { generated: recs.length, created, recommendations: list.data } };
  }

  async list(user: AuthUser, status?: string) {
    const allowed = allowedOutletIds(user);
    const res = await this.db.query(
      `SELECT tr.id, tr.from_outlet_id, fo.name AS from_name, tr.to_outlet_id, to2.name AS to_name,
              tr.position_id, p.name AS position_name, tr.headcount, tr.confidence, tr.reason,
              tr.status, tr.generated_at, tr.acted_at
       FROM transfer_recommendations tr
       JOIN outlets fo ON fo.id = tr.from_outlet_id
       JOIN outlets to2 ON to2.id = tr.to_outlet_id
       LEFT JOIN positions p ON p.id = tr.position_id
       WHERE tr.tenant_id = $1 AND tr.deleted_at IS NULL
         AND ($2::text IS NULL OR tr.status = $2)
         AND ($3::uuid[] IS NULL OR tr.from_outlet_id = ANY($3) OR tr.to_outlet_id = ANY($3))
       ORDER BY tr.generated_at DESC LIMIT 200`,
      [user.tenantId, status ?? null, allowed],
    );
    return {
      data: res.rows.map((r) => ({
        id: r.id, fromOutletId: r.from_outlet_id, fromName: r.from_name,
        toOutletId: r.to_outlet_id, toName: r.to_name,
        positionId: r.position_id, positionName: r.position_name,
        headcount: r.headcount, confidence: r.confidence, reason: r.reason,
        status: r.status, generatedAt: r.generated_at, actedAt: r.acted_at,
      })),
    };
  }

  private async loadInScope(user: AuthUser, id: string) {
    const res = await this.db.query(
      "SELECT * FROM transfer_recommendations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL",
      [id, user.tenantId],
    );
    const rec = res.rows[0];
    if (!rec) throw new NotFoundException("Recommendation not found");
    const allowed = allowedOutletIds(user);
    if (allowed !== null && !(allowed.includes(rec.from_outlet_id) || allowed.includes(rec.to_outlet_id))) {
      throw new NotFoundException("Recommendation not found");
    }
    return rec;
  }

  /** Accept → mark accepted + return a deep-link payload for the existing /allocation flow. */
  async accept(user: AuthUser, id: string) {
    const rec = await this.loadInScope(user, id);
    if (rec.status !== "pending") throw new BadRequestException(`Recommendation is already ${rec.status}.`);
    await this.db.query(
      "UPDATE transfer_recommendations SET status = 'accepted', acted_by = $2, acted_at = NOW() WHERE id = $1",
      [id, user.id],
    );
    return {
      data: {
        id, status: "accepted",
        // The web opens the Allocation page prefilled; the human picks the specific staff member.
        deepLink: { path: "/allocation", fromOutletId: rec.from_outlet_id, toOutletId: rec.to_outlet_id, positionId: rec.position_id, headcount: rec.headcount },
      },
    };
  }

  async reject(user: AuthUser, id: string) {
    const rec = await this.loadInScope(user, id);
    if (rec.status !== "pending") throw new BadRequestException(`Recommendation is already ${rec.status}.`);
    await this.db.query(
      "UPDATE transfer_recommendations SET status = 'rejected', acted_by = $2, acted_at = NOW() WHERE id = $1",
      [id, user.id],
    );
    return { data: { id, status: "rejected" } };
  }
}
