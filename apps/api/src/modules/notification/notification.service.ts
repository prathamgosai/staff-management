import { Injectable, Inject, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { formatError } from "../../common/utils/format-error";
import { NotificationEvent } from "@workforceiq/shared";
import type { NotificationPayloadMap, AuthUser } from "@workforceiq/shared";
import { toLocalDateStr } from "../../common/utils/week.util";
import { renderMessage, type RecipientKind } from "./notification.messages";
import { DISPATCH_JOB, DISPATCH_JOB_OPTS, NOTIFICATIONS_QUEUE } from "./notification.constants";
import { MagicLinkService } from "../public/magic-link.service";

/** A resolved recipient: a user (in-app target) and/or a staff row (external contact). */
interface Target {
  userId: string | null;
  staffId: string | null;
  kind: RecipientKind;
  extras: Record<string, unknown>;
}

type Payload = Record<string, unknown> & { tenantId: string };

interface PrefsUpdate {
  inAppEnabled?: boolean;
  whatsappEnabled?: boolean;
  emailEnabled?: boolean;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(DB_POOL) private readonly db: Pool,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
    private readonly magic: MagicLinkService,
  ) {}

  // ── Emit ────────────────────────────────────────────────────────────────────

  /**
   * Single entry point for the whole system. Resolves recipients from the event
   * payload + server-side role/outlet scope (never a client-supplied id), writes
   * one in-app `notifications` row per recipient user, and enqueues one external
   * fan-out job per recipient. Never throws — call sites fire-and-forget so a
   * notification failure can't break the triggering request.
   */
  async emit<E extends NotificationEvent>(event: E, payload: NotificationPayloadMap[E]): Promise<void> {
    const p = payload as unknown as Payload;
    try {
      const targets = await this.resolveTargets(event, p);

      // De-dupe a user who matches two categories (e.g. head who is also affected).
      const seen = new Set<string>();
      const unique: Target[] = [];
      for (const t of targets) {
        const key = t.userId ? `u:${t.userId}` : t.staffId ? `s:${t.staffId}` : "";
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(t);
      }

      // Fan out in parallel — a roster publish can be dozens of recipients and each
      // insert is a full (remote) round-trip; serialising them would take seconds.
      await Promise.all(unique.map((t) => this.deliverTarget(event, p, JSON.stringify(payload), t)));
    } catch (e) {
      this.logger.error(`emit(${event}) failed: ${formatError(e)}`);
    }
  }

  /** Write one recipient's in-app row (if they're a user) and enqueue external delivery. */
  private async deliverTarget(event: NotificationEvent, p: Payload, dataJson: string, t: Target): Promise<void> {
    const msg = renderMessage(t.kind, { ...p, ...t.extras });

    let notificationId: string | null = null;
    if (t.userId) {
      const ins = await this.db.query(
        `INSERT INTO notifications (tenant_id, user_id, type, title, body, data, channels_sent)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, '["in_app"]'::jsonb)
         RETURNING id`,
        [p.tenantId, t.userId, event, msg.title, msg.body, dataJson],
      );
      notificationId = ins.rows[0].id as string;
    }

    // Enqueue external delivery (WhatsApp -> email fallback). Skip only when there is
    // neither an in-app row nor any external contact possible (nothing to do).
    if (t.userId || t.staffId) {
      await this.queue.add(
        DISPATCH_JOB,
        {
          tenantId: p.tenantId,
          notificationId,
          userId: t.userId,
          staffId: t.staffId,
          title: msg.title,
          body: msg.body,
          waTemplate: msg.waTemplate,
          waVars: msg.waVars,
        },
        DISPATCH_JOB_OPTS,
      );
    }
  }

  // ── Recipient resolution (the matrix) ────────────────────────────────────────

  private async resolveTargets(event: NotificationEvent, p: Payload): Promise<Target[]> {
    switch (event) {
      case NotificationEvent.ROSTER_PUBLISHED: {
        const outletId = p.outletId as string;
        const weekKey = p.weekKey as string;
        const [staff, heads, outletName] = await Promise.all([
          this.rosteredStaff(outletId, weekKey),
          this.outletHeads(p.tenantId, outletId),
          this.outletName(outletId),
        ]);
        const targets: Target[] = staff.map((row) => {
          // For staff with no login (WhatsApp only) — or everyone when flagged — attach a
          // read-only magic link so they can open their week without an account.
          const magicLink =
            this.magic.isEnabled() && (this.magic.linkForEveryone() || !row.user_id)
              ? this.magic.linkFor({ staffId: row.staff_id, weekKey, tenantId: p.tenantId })
              : null;
          return {
            userId: row.user_id,
            staffId: row.staff_id,
            kind: "roster_self" as const,
            extras: { weekKey, shiftCount: Number(row.shift_count), magicLink },
          };
        });
        for (const h of heads) {
          if (h.id === p.publishedBy) continue; // don't notify the publisher of their own action
          targets.push({ userId: h.id, staffId: null, kind: "roster_head", extras: { weekKey, outletName, staffCount: staff.length } });
        }
        return targets;
      }

      case NotificationEvent.SHIFT_CHANGED: {
        const outletId = p.outletId as string;
        const staffId = p.staffId as string;
        const [staff, heads, outletName] = await Promise.all([
          this.staffById(staffId),
          this.outletHeads(p.tenantId, outletId),
          this.outletName(outletId),
        ]);
        const targets: Target[] = [];
        if (staff) {
          targets.push({
            userId: staff.user_id,
            staffId: staff.id,
            kind: "shift_self",
            extras: { shiftDate: p.shiftDate, startTime: p.startTime, endTime: p.endTime, shiftName: p.shiftName, outletName },
          });
        }
        // A bulk template retime sets suppressHead so the head isn't pinged once per
        // affected staff; a single move leaves it unset so the head is notified.
        if (!p.suppressHead) {
          for (const h of heads) {
            if (h.id === p.changedBy) continue;
            targets.push({
              userId: h.id,
              staffId: null,
              kind: "shift_head",
              extras: { shiftDate: p.shiftDate, startTime: p.startTime, endTime: p.endTime, staffName: staff?.name },
            });
          }
        }
        return targets;
      }

      case NotificationEvent.SHIFT_REMINDER: {
        const staff = await this.staffById(p.staffId as string);
        if (!staff) return [];
        const outletName = p.outletId ? await this.outletName(p.outletId as string) : undefined;
        return [
          {
            userId: staff.user_id,
            staffId: staff.id,
            kind: "reminder_self",
            extras: { shiftDate: p.shiftDate, startTime: p.startTime, endTime: p.endTime, outletName },
          },
        ];
      }

      case NotificationEvent.LEAVE_REQUESTED: {
        const outletId = p.outletId as string;
        const [staff, heads, admins] = await Promise.all([
          this.staffById(p.staffId as string),
          this.outletHeads(p.tenantId, outletId),
          this.roleUsers(p.tenantId, ["hr", "admin"]),
        ]);
        const targets: Target[] = [];
        if (staff) {
          targets.push({ userId: staff.user_id, staffId: staff.id, kind: "leave_confirm", extras: { startDate: p.startDate, endDate: p.endDate } });
        }
        const approverExtras = { requesterName: p.requesterName, startDate: p.startDate, endDate: p.endDate };
        for (const h of heads) targets.push({ userId: h.id, staffId: null, kind: "leave_approver", extras: approverExtras });
        for (const a of admins) targets.push({ userId: a.id, staffId: null, kind: "leave_approver", extras: approverExtras });
        return targets;
      }

      case NotificationEvent.LEAVE_DECIDED: {
        const outletId = p.outletId as string;
        const [staff, heads] = await Promise.all([
          this.staffById(p.staffId as string),
          this.outletHeads(p.tenantId, outletId),
        ]);
        const targets: Target[] = [];
        if (staff) {
          targets.push({ userId: staff.user_id, staffId: staff.id, kind: "leave_decided_self", extras: { decision: p.decision, startDate: p.startDate, endDate: p.endDate } });
        }
        for (const h of heads) {
          if (h.id === p.decidedBy) continue;
          targets.push({ userId: h.id, staffId: null, kind: "leave_coverage", extras: { requesterName: staff?.name, decision: p.decision, startDate: p.startDate, endDate: p.endDate } });
        }
        return targets;
      }

      case NotificationEvent.ACCOUNT_PENDING_APPROVAL: {
        const recips = await this.roleUsers(p.tenantId, ["hr", "admin", "super_admin"]);
        return recips.map((u) => ({ userId: u.id, staffId: null, kind: "account_pending" as const, extras: { name: p.name, email: p.email, ticketNumber: p.ticketNumber } }));
      }

      case NotificationEvent.SYSTEM_ALERT: {
        const recips = await this.roleUsers(p.tenantId, ["hr", "admin", "super_admin"]);
        return recips.map((u) => ({ userId: u.id, staffId: null, kind: "system_alert" as const, extras: { title: p.title, message: p.message } }));
      }

      default:
        return [];
    }
  }

  /** Active head_of_house / chef users assigned to this outlet (outlet_ids contains it). */
  private async outletHeads(tenantId: string, outletId: string): Promise<{ id: string; role: string }[]> {
    const res = await this.db.query(
      `SELECT id, role FROM users
       WHERE tenant_id = $1 AND is_active = true
         AND role IN ('head_of_house','chef')
         AND $2 = ANY(outlet_ids)`,
      [tenantId, outletId],
    );
    return res.rows;
  }

  /** Active users with any of the given roles in the tenant. */
  private async roleUsers(tenantId: string, roles: string[]): Promise<{ id: string; role: string }[]> {
    const res = await this.db.query(
      `SELECT id, role FROM users
       WHERE tenant_id = $1 AND is_active = true AND role = ANY($2::user_role[])`,
      [tenantId, roles],
    );
    return res.rows;
  }

  /** Staff rostered for an outlet's week, with their user_id and shift count. */
  private async rosteredStaff(outletId: string, weekKey: string): Promise<{ staff_id: string; user_id: string | null; name: string; shift_count: string }[]> {
    const res = await this.db.query(
      `SELECT s.id AS staff_id, s.user_id, s.name, COUNT(DISTINCT ss.id) AS shift_count
       FROM shift_assignments sa
       JOIN schedule_shifts ss ON ss.id = sa.shift_id
       JOIN schedules sc ON sc.id = ss.schedule_id
       JOIN staff s ON s.id = sa.staff_id
       WHERE sc.outlet_id = $1 AND sc.week_start_date = $2 AND sa.status <> 'cancelled'
       GROUP BY s.id, s.user_id, s.name`,
      [outletId, weekKey],
    );
    return res.rows;
  }

  private async staffById(staffId: string): Promise<{ id: string; user_id: string | null; name: string; current_outlet_id: string } | null> {
    const res = await this.db.query(
      "SELECT id, user_id, name, current_outlet_id FROM staff WHERE id = $1",
      [staffId],
    );
    return res.rows[0] ?? null;
  }

  private async outletName(outletId: string): Promise<string | undefined> {
    const res = await this.db.query("SELECT name FROM outlets WHERE id = $1", [outletId]);
    return res.rows[0]?.name;
  }

  // ── Nightly shift reminders ──────────────────────────────────────────────────

  /**
   * Enqueue SHIFT_REMINDER for every staff member with a PUBLISHED shift tomorrow.
   * Idempotent: a (user, shift) that already has a shift_reminder notification is
   * skipped, so a re-run / restart never double-sends. Returns counts for logging.
   */
  async sendTomorrowReminders(): Promise<{ sent: number; skipped: number }> {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const tomorrow = toLocalDateStr(d);

    const rows = await this.db.query(
      `SELECT s.id AS staff_id, s.user_id, ss.id AS shift_id, ss.date,
              ss.start_time, ss.end_time, ss.outlet_id, o.tenant_id
       FROM shift_assignments sa
       JOIN schedule_shifts ss ON ss.id = sa.shift_id
       JOIN schedules sc ON sc.id = ss.schedule_id AND sc.status = 'published'
       JOIN staff s ON s.id = sa.staff_id
       JOIN outlets o ON o.id = ss.outlet_id
       WHERE ss.date = $1 AND sa.status <> 'cancelled'`,
      [tomorrow],
    );

    let sent = 0;
    let skipped = 0;
    for (const r of rows.rows) {
      // The reminder's idempotency model keys on an existing shift_reminder notification,
      // which is user_id-scoped. Login-less staff have no such row to dedupe against, so a
      // re-run could double-send their WhatsApp — skip them here (they still receive the
      // publish + shift-change WhatsApps). Nightly reminders go to staff with an app login.
      if (!r.user_id) {
        skipped++;
        continue;
      }
      const dup = await this.db.query(
        `SELECT 1 FROM notifications
         WHERE user_id = $1 AND type = $2 AND data->>'shiftId' = $3 LIMIT 1`,
        [r.user_id, NotificationEvent.SHIFT_REMINDER, r.shift_id],
      );
      if (dup.rows[0]) {
        skipped++;
        continue;
      }
      await this.emit(NotificationEvent.SHIFT_REMINDER, {
        tenantId: r.tenant_id,
        outletId: r.outlet_id,
        staffId: r.staff_id,
        shiftId: r.shift_id,
        shiftDate: toLocalDateStr(r.date),
        startTime: (r.start_time ?? "").slice(0, 5),
        endTime: (r.end_time ?? "").slice(0, 5),
      });
      sent++;
    }
    this.logger.log(`Shift reminders for ${tomorrow}: ${sent} sent, ${skipped} already notified`);
    return { sent, skipped };
  }

  // ── Own-data reads (JWT + own only) ──────────────────────────────────────────

  async listOwn(user: AuthUser, page = 1, limit = 20) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const offset = (safePage - 1) * safeLimit;

    const [rows, count] = await Promise.all([
      this.db.query(
        `SELECT id, type, title, body, data, channels_sent, read_at, created_at
         FROM notifications
         WHERE user_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [user.id, user.tenantId, safeLimit, offset],
      ),
      this.db.query(
        "SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = $1 AND tenant_id = $2",
        [user.id, user.tenantId],
      ),
    ]);

    const total = count.rows[0].total as number;
    return {
      data: {
        items: rows.rows.map(this.mapRow),
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async unreadCount(user: AuthUser) {
    const res = await this.db.query(
      "SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND tenant_id = $2 AND read_at IS NULL",
      [user.id, user.tenantId],
    );
    return { data: { count: res.rows[0].count as number } };
  }

  /** Mark ONE notification read — scoped to the caller via user_id (no id to tamper). */
  async markRead(user: AuthUser, id: string) {
    const res = await this.db.query(
      "UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 AND read_at IS NULL",
      [id, user.id],
    );
    return { data: { updated: res.rowCount ?? 0 } };
  }

  async markAllRead(user: AuthUser) {
    const res = await this.db.query(
      "UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL",
      [user.id],
    );
    return { data: { updated: res.rowCount ?? 0 } };
  }

  // ── Preferences (per-user channel toggles) ──────────────────────────────────

  async getPreferences(user: AuthUser) {
    const res = await this.db.query(
      "SELECT in_app_enabled, whatsapp_enabled, email_enabled FROM notification_preferences WHERE user_id = $1",
      [user.id],
    );
    const row = res.rows[0];
    return {
      data: {
        inAppEnabled: row ? row.in_app_enabled : true,
        whatsappEnabled: row ? row.whatsapp_enabled : true,
        emailEnabled: row ? row.email_enabled : true,
      },
    };
  }

  async updatePreferences(user: AuthUser, dto: PrefsUpdate) {
    const res = await this.db.query(
      `INSERT INTO notification_preferences (user_id, in_app_enabled, whatsapp_enabled, email_enabled, updated_at)
       VALUES ($1, COALESCE($2, true), COALESCE($3, true), COALESCE($4, true), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         in_app_enabled   = COALESCE($2, notification_preferences.in_app_enabled),
         whatsapp_enabled = COALESCE($3, notification_preferences.whatsapp_enabled),
         email_enabled    = COALESCE($4, notification_preferences.email_enabled),
         updated_at = NOW()
       RETURNING in_app_enabled, whatsapp_enabled, email_enabled`,
      [user.id, dto.inAppEnabled ?? null, dto.whatsappEnabled ?? null, dto.emailEnabled ?? null],
    );
    const row = res.rows[0];
    return {
      data: {
        inAppEnabled: row.in_app_enabled,
        whatsappEnabled: row.whatsapp_enabled,
        emailEnabled: row.email_enabled,
      },
    };
  }

  private mapRow(r: Record<string, unknown>) {
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      data: r.data,
      channelsSent: r.channels_sent,
      readAt: r.read_at,
      createdAt: r.created_at,
    };
  }
}
