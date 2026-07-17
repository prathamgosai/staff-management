import { Injectable, Inject, NotFoundException, BadRequestException } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { allowedOutletIds, assertOutletAllowed } from "../../common/auth/outlet-scope";
import type { AuthUser } from "@workforceiq/shared";
import {
  UpdateConfigurationDto, UpdateStaffRatiosDto, UpsertCategoryDto,
} from "./dto/restaurant-config.dto";
import { diffRatios, ExistingRatio, RatioInput } from "./ratio-diff";

/**
 * Restaurant configuration + per-role staffing ratios (Feature 2). Reads gated by
 * allocation:read; writes by staffing:ratios (+ outlet scope). Config lives in
 * restaurant_configurations (1:1 outlet) and does NOT duplicate outlets.* capacity columns —
 * those are joined in for display. Per-role ratios live in staff_requirement_configurations
 * with an immutable change history.
 */
@Injectable()
export class RestaurantConfigService {
  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  private async loadOutlet(user: AuthUser, outletId: string) {
    const res = await this.db.query(
      `SELECT id, name, code, seating_capacity, operating_hours, total_tables, max_pax
       FROM outlets WHERE id = $1 AND tenant_id = $2`,
      [outletId, user.tenantId],
    );
    if (!res.rows[0]) throw new NotFoundException("Outlet not found");
    return res.rows[0];
  }

  private assertInScope(user: AuthUser, outletId: string) {
    const allowed = allowedOutletIds(user);
    if (allowed !== null && !allowed.includes(outletId)) {
      throw new NotFoundException("Outlet not found");
    }
  }

  // ── configuration ─────────────────────────────────────────────────────────
  async getConfiguration(user: AuthUser, outletId: string) {
    const outlet = await this.loadOutlet(user, outletId);
    this.assertInScope(user, outletId);
    const cfg = await this.db.query(
      `SELECT rc.*, cat.name AS category_name
       FROM restaurant_configurations rc
       LEFT JOIN restaurant_categories cat ON cat.id = rc.category_id
       WHERE rc.outlet_id = $1 AND rc.tenant_id = $2 AND rc.deleted_at IS NULL`,
      [outletId, user.tenantId],
    );
    const c = cfg.rows[0];
    return {
      data: {
        outletId,
        name: outlet.name,
        code: outlet.code,
        seatingCapacity: outlet.seating_capacity,
        totalTables: outlet.total_tables,
        maxPax: outlet.max_pax,
        operatingHours: outlet.operating_hours,
        configuration: c
          ? {
              categoryId: c.category_id, categoryName: c.category_name,
              areaSqft: c.area_sqft, kitchenSizeSqft: c.kitchen_size_sqft,
              avgDailyPax: c.avg_daily_pax, peakPax: c.peak_pax,
              lunchCapacity: c.lunch_capacity, dinnerCapacity: c.dinner_capacity,
              paxBasis: c.pax_basis, tExcess: c.t_excess === null ? null : Number(c.t_excess),
              tMinor: c.t_minor === null ? null : Number(c.t_minor),
              updatedAt: c.updated_at,
            }
          : null,
      },
    };
  }

  async updateConfiguration(user: AuthUser, outletId: string, dto: UpdateConfigurationDto) {
    await this.loadOutlet(user, outletId);
    assertOutletAllowed(user, outletId);
    if (dto.categoryId) {
      const cat = await this.db.query(
        "SELECT 1 FROM restaurant_categories WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL",
        [dto.categoryId, user.tenantId],
      );
      if (!cat.rowCount) throw new BadRequestException("Unknown restaurant category.");
    }
    await this.db.query(
      `INSERT INTO restaurant_configurations
         (tenant_id, outlet_id, category_id, area_sqft, kitchen_size_sqft, avg_daily_pax, peak_pax,
          lunch_capacity, dinner_capacity, pax_basis, t_excess, t_minor, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
       ON CONFLICT (outlet_id) DO UPDATE SET
         category_id      = COALESCE(EXCLUDED.category_id, restaurant_configurations.category_id),
         area_sqft        = COALESCE(EXCLUDED.area_sqft, restaurant_configurations.area_sqft),
         kitchen_size_sqft= COALESCE(EXCLUDED.kitchen_size_sqft, restaurant_configurations.kitchen_size_sqft),
         avg_daily_pax    = COALESCE(EXCLUDED.avg_daily_pax, restaurant_configurations.avg_daily_pax),
         peak_pax         = COALESCE(EXCLUDED.peak_pax, restaurant_configurations.peak_pax),
         lunch_capacity   = COALESCE(EXCLUDED.lunch_capacity, restaurant_configurations.lunch_capacity),
         dinner_capacity  = COALESCE(EXCLUDED.dinner_capacity, restaurant_configurations.dinner_capacity),
         pax_basis        = COALESCE(EXCLUDED.pax_basis, restaurant_configurations.pax_basis),
         t_excess         = COALESCE(EXCLUDED.t_excess, restaurant_configurations.t_excess),
         t_minor          = COALESCE(EXCLUDED.t_minor, restaurant_configurations.t_minor),
         updated_by       = EXCLUDED.updated_by`,
      [
        user.tenantId, outletId, dto.categoryId ?? null, dto.areaSqft ?? null, dto.kitchenSizeSqft ?? null,
        dto.avgDailyPax ?? null, dto.peakPax ?? null, dto.lunchCapacity ?? null, dto.dinnerCapacity ?? null,
        dto.paxBasis ?? null, dto.tExcess ?? null, dto.tMinor ?? null, user.id,
      ],
    );
    return this.getConfiguration(user, outletId);
  }

  // ── per-role ratios ─────────────────────────────────────────────────────────
  /** Every active position with its per-outlet ratio (null where unset). */
  async getStaffRatios(user: AuthUser, outletId: string) {
    await this.loadOutlet(user, outletId);
    this.assertInScope(user, outletId);
    const res = await this.db.query(
      `SELECT p.id AS position_id, p.name AS position_name, p.level,
              src.guests_per_staff, src.min_staff, src.max_staff, src.updated_at
       FROM positions p
       LEFT JOIN staff_requirement_configurations src
         ON src.position_id = p.id AND src.outlet_id = $2 AND src.deleted_at IS NULL
       WHERE p.tenant_id = $1 AND p.is_active = true
       ORDER BY p.level DESC, p.name ASC`,
      [user.tenantId, outletId],
    );
    return {
      data: res.rows.map((r) => ({
        positionId: r.position_id, positionName: r.position_name, level: r.level,
        guestsPerStaff: r.guests_per_staff === null ? null : Number(r.guests_per_staff),
        minStaff: r.min_staff, maxStaff: r.max_staff, updatedAt: r.updated_at,
      })),
    };
  }

  async updateStaffRatios(user: AuthUser, outletId: string, dto: UpdateStaffRatiosDto) {
    await this.loadOutlet(user, outletId);
    assertOutletAllowed(user, outletId);

    const incoming: RatioInput[] = dto.ratios ?? [];
    if (incoming.length === 0) throw new BadRequestException("Provide at least one ratio row.");
    for (const r of incoming) {
      if (r.maxStaff != null && r.maxStaff < r.minStaff) {
        throw new BadRequestException("Max staff cannot be less than min staff.");
      }
    }
    // Validate every positionId belongs to this tenant.
    const validPos = await this.db.query(
      "SELECT id FROM positions WHERE tenant_id = $1 AND id = ANY($2::uuid[])",
      [user.tenantId, incoming.map((r) => r.positionId)],
    );
    const validIds = new Set(validPos.rows.map((r) => r.id as string));
    for (const r of incoming) {
      if (!validIds.has(r.positionId)) throw new BadRequestException("One or more roles are invalid for this tenant.");
    }

    const existingRes = await this.db.query(
      `SELECT position_id, guests_per_staff, min_staff FROM staff_requirement_configurations
       WHERE outlet_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [outletId, user.tenantId],
    );
    const existing = new Map<string, ExistingRatio>(
      existingRes.rows.map((r) => [r.position_id as string, { guestsPerStaff: Number(r.guests_per_staff), minStaff: Number(r.min_staff) }]),
    );
    const changes = diffRatios(existing, incoming);

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      for (const r of incoming) {
        await client.query(
          `INSERT INTO staff_requirement_configurations
             (tenant_id, outlet_id, position_id, guests_per_staff, min_staff, max_staff, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
           ON CONFLICT (outlet_id, position_id) WHERE deleted_at IS NULL
           DO UPDATE SET guests_per_staff = EXCLUDED.guests_per_staff, min_staff = EXCLUDED.min_staff,
                         max_staff = EXCLUDED.max_staff, updated_by = EXCLUDED.updated_by`,
          [user.tenantId, outletId, r.positionId, r.guestsPerStaff, r.minStaff, r.maxStaff ?? null, user.id],
        );
      }
      for (const c of changes) {
        await client.query(
          `INSERT INTO staff_requirement_config_history
             (tenant_id, outlet_id, position_id, old_guests_per_staff, new_guests_per_staff, old_min_staff, new_min_staff, changed_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [user.tenantId, outletId, c.positionId, c.oldGuestsPerStaff, c.newGuestsPerStaff, c.oldMinStaff, c.newMinStaff, user.id],
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return this.getStaffRatios(user, outletId);
  }

  async getRatioHistory(user: AuthUser, outletId: string) {
    await this.loadOutlet(user, outletId);
    this.assertInScope(user, outletId);
    const res = await this.db.query(
      `SELECT h.id, h.position_id, p.name AS position_name,
              h.old_guests_per_staff, h.new_guests_per_staff, h.old_min_staff, h.new_min_staff,
              h.changed_by, u.name AS changed_by_name, h.changed_at
       FROM staff_requirement_config_history h
       LEFT JOIN positions p ON p.id = h.position_id
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.outlet_id = $1 AND h.tenant_id = $2
       ORDER BY h.changed_at DESC LIMIT 100`,
      [outletId, user.tenantId],
    );
    return {
      data: res.rows.map((r) => ({
        id: r.id, positionId: r.position_id, positionName: r.position_name,
        oldGuestsPerStaff: r.old_guests_per_staff === null ? null : Number(r.old_guests_per_staff),
        newGuestsPerStaff: Number(r.new_guests_per_staff),
        oldMinStaff: r.old_min_staff, newMinStaff: r.new_min_staff,
        changedBy: r.changed_by, changedByName: r.changed_by_name, changedAt: r.changed_at,
      })),
    };
  }

  // ── categories ────────────────────────────────────────────────────────────
  async listCategories(user: AuthUser) {
    const res = await this.db.query(
      "SELECT id, name, sort_order, is_active FROM restaurant_categories WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY sort_order, name",
      [user.tenantId],
    );
    return { data: res.rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order, isActive: r.is_active })) };
  }

  async createCategory(user: AuthUser, dto: UpsertCategoryDto) {
    try {
      const res = await this.db.query(
        "INSERT INTO restaurant_categories (tenant_id, name, sort_order) VALUES ($1,$2,$3) RETURNING id, name, sort_order, is_active",
        [user.tenantId, dto.name.trim(), dto.sortOrder ?? 100],
      );
      const r = res.rows[0];
      return { data: { id: r.id, name: r.name, sortOrder: r.sort_order, isActive: r.is_active } };
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new BadRequestException(`Category "${dto.name}" already exists.`);
      throw e;
    }
  }

  /**
   * Prefill an outlet's per-role ratios from a category template. Falls back to the company
   * category defaults (staffing_ratios × post_category_map) for any position the template
   * doesn't cover, so every position gets a sensible starting ratio.
   */
  async applyTemplate(user: AuthUser, outletId: string, categoryId: string) {
    await this.loadOutlet(user, outletId);
    assertOutletAllowed(user, outletId);

    const [tplRes, posRes, catDefaults] = await Promise.all([
      this.db.query(
        "SELECT position_id, guests_per_staff, min_staff FROM ratio_templates WHERE tenant_id = $1 AND category_id = $2 AND deleted_at IS NULL",
        [user.tenantId, categoryId],
      ),
      this.db.query(
        `SELECT p.id AS position_id, COALESCE(pcm.category, 'General') AS category
         FROM positions p
         LEFT JOIN post_category_map pcm ON pcm.tenant_id = p.tenant_id AND LOWER(pcm.post) = LOWER(p.name)
         WHERE p.tenant_id = $1 AND p.is_active = true`,
        [user.tenantId],
      ),
      this.db.query("SELECT category, pax_per_staff, min_staff FROM staffing_ratios WHERE tenant_id = $1", [user.tenantId]),
    ]);

    const tpl = new Map(tplRes.rows.map((r) => [r.position_id as string, { g: Number(r.guests_per_staff), m: Number(r.min_staff) }]));
    const catRatio = new Map(catDefaults.rows.map((r) => [r.category as string, { g: Number(r.pax_per_staff), m: Number(r.min_staff) }]));

    const rows: RatioInput[] = [];
    for (const p of posRes.rows) {
      const pid = p.position_id as string;
      if (tpl.has(pid)) {
        rows.push({ positionId: pid, guestsPerStaff: tpl.get(pid)!.g, minStaff: tpl.get(pid)!.m });
      } else if (catRatio.has(p.category)) {
        const c = catRatio.get(p.category)!;
        rows.push({ positionId: pid, guestsPerStaff: c.g, minStaff: c.m });
      }
    }
    if (rows.length === 0) throw new BadRequestException("No template or company defaults available to apply.");
    return this.updateStaffRatios(user, outletId, { ratios: rows });
  }
}
