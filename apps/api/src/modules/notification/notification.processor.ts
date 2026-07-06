import { Processor, Process } from "@nestjs/bull";
import { Job } from "bull";
import { Logger, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { formatError } from "../../common/utils/format-error";
import { WhatsAppProvider } from "./providers/whatsapp.provider";
import { EmailProvider } from "./providers/email.provider";
import { NotificationService } from "./notification.service";
import { NOTIFICATIONS_QUEUE, DISPATCH_JOB, REMINDER_CRON_JOB, WA_TEMPLATE_LANG } from "./notification.constants";

interface DispatchData {
  tenantId: string;
  notificationId: string | null;
  userId: string | null;
  staffId: string | null;
  title: string;
  body: string;
  waTemplate: string | null;
  waVars: string[];
}

/**
 * External-channel delivery worker for a single recipient. Order: honour the
 * user's channel prefs, try WhatsApp (only when ENABLE_WHATSAPP=true and a phone
 * exists), fall back to email, else in-app only. Records what actually went out
 * in the notification's channels_sent. Never lets a rejection crash the worker;
 * unwraps AggregateError the same way the rotation scheduler does.
 */
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    @Inject(DB_POOL) private readonly db: Pool,
    private readonly whatsapp: WhatsAppProvider,
    private readonly email: EmailProvider,
    private readonly notificationService: NotificationService,
  ) {}

  /** Nightly repeatable: enqueue SHIFT_REMINDER for everyone rostered tomorrow. */
  @Process(REMINDER_CRON_JOB)
  async handleReminderCron(): Promise<void> {
    try {
      await this.notificationService.sendTomorrowReminders();
    } catch (e) {
      this.logger.error(`shift-reminder cron failed: ${formatError(e)}`);
    }
  }

  @Process(DISPATCH_JOB)
  async handleDispatch(job: Job<DispatchData>): Promise<void> {
    const { notificationId, userId, staffId, title, body, waTemplate, waVars } = job.data;

    // Prefs + contact are loaded up-front; a DB error here means nothing was sent
    // yet, so it's safe to throw and let Bull retry with backoff.
    let prefs: { whatsapp: boolean; email: boolean };
    let contact: { name: string; phone: string | null; email: string | null };
    try {
      prefs = await this.loadPrefs(userId);
      contact = await this.loadContact(userId, staffId);
    } catch (e) {
      this.logger.error(`dispatch prep failed (notif ${notificationId ?? "-"}): ${formatError(e)}`);
      throw e;
    }

    const sent: string[] = ["in_app"]; // the in-app row was already written by emit()
    let waDelivered = false;

    // 1) WhatsApp — only when the channel is enabled AND we have a phone + template.
    if (prefs.whatsapp && this.whatsapp.isEnabled() && contact.phone && waTemplate) {
      const digits = contact.phone.replace(/\D/g, "");
      const r = await this.whatsapp.sendTemplate(digits, waTemplate, WA_TEMPLATE_LANG, [contact.name || "there", ...waVars]);
      if (r.success) {
        sent.push("whatsapp");
        waDelivered = true;
      }
    }

    // 2) Email fallback — when WhatsApp didn't deliver and the user allows email.
    if (!waDelivered && prefs.email && contact.email) {
      const r = await this.email.send(contact.email, title, body);
      if (r.success) sent.push("email");
    }

    // 3) Record what actually went out. Best-effort: delivery already happened, so a
    //    failed update must NOT trigger a retry that would re-send the message.
    if (notificationId) {
      try {
        await this.db.query(
          "UPDATE notifications SET channels_sent = $2::jsonb WHERE id = $1",
          [notificationId, JSON.stringify(sent)],
        );
      } catch (e) {
        this.logger.warn(`channels_sent update failed (notif ${notificationId}): ${formatError(e)}`);
      }
    }
  }

  /** Per-user channel prefs; defaults to all-enabled when no row / no user. */
  private async loadPrefs(userId: string | null): Promise<{ whatsapp: boolean; email: boolean }> {
    if (!userId) return { whatsapp: true, email: true };
    const res = await this.db.query(
      "SELECT whatsapp_enabled, email_enabled FROM notification_preferences WHERE user_id = $1",
      [userId],
    );
    const row = res.rows[0];
    return { whatsapp: row ? row.whatsapp_enabled : true, email: row ? row.email_enabled : true };
  }

  /**
   * Resolve delivery contact. Staff supply phone (whatsapp||phone) + email + name;
   * admins/hr often have no staff row, so fall back to users.email/name (no phone).
   */
  private async loadContact(
    userId: string | null,
    staffId: string | null,
  ): Promise<{ name: string; phone: string | null; email: string | null }> {
    let name = "";
    let phone: string | null = null;
    let email: string | null = null;

    if (staffId) {
      const r = await this.db.query("SELECT name, phone, whatsapp, email FROM staff WHERE id = $1", [staffId]);
      if (r.rows[0]) {
        name = r.rows[0].name ?? "";
        phone = r.rows[0].whatsapp || r.rows[0].phone || null;
        email = r.rows[0].email || null;
      }
    }
    if ((!name || !email) && userId) {
      const r = await this.db.query("SELECT name, email FROM users WHERE id = $1", [userId]);
      if (r.rows[0]) {
        if (!name) name = r.rows[0].name ?? "";
        if (!email) email = r.rows[0].email || null;
      }
    }
    return { name, phone, email };
  }
}
