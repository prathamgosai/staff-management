import { Processor, Process } from "@nestjs/bull";
import { Job } from "bull";
import { Logger, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { WhatsAppProvider } from "./providers/whatsapp.provider";
import { EmailProvider } from "./providers/email.provider";

@Processor("notifications")
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    @Inject(DB_POOL) private readonly db: Pool,
    private readonly whatsapp: WhatsAppProvider,
    private readonly email: EmailProvider,
  ) {}

  @Process("send")
  async handleSend(job: Job<{ tenantId: string; recipientId: string; channel: string; eventType: string; variables: Record<string, string> }>) {
    const { tenantId, recipientId, channel, eventType, variables } = job.data;

    const staff = await this.db.query(
      "SELECT name, phone, whatsapp, email FROM staff WHERE id = $1",
      [recipientId],
    );
    if (!staff.rows[0]) return;
    const recipient = staff.rows[0];

    const template = await this.db.query(
      `SELECT * FROM notification_templates
       WHERE tenant_id = $1 AND event_type = $2 AND channel = $3 AND is_active = true LIMIT 1`,
      [tenantId, eventType, channel],
    );
    if (!template.rows[0]) {
      this.logger.warn(`No template for ${eventType}/${channel}`);
      return;
    }

    const body = this.interpolate(template.rows[0].body_template, { ...variables, name: recipient.name });
    const subject = template.rows[0].subject ? this.interpolate(template.rows[0].subject, variables) : undefined;

    let result: { success: boolean; messageId?: string } = { success: false };
    if (channel === "whatsapp") {
      const phone = recipient.whatsapp || recipient.phone;
      if (phone) result = await this.whatsapp.send(phone.replace(/\D/g, ""), body);
    } else if (channel === "email" && recipient.email) {
      result = await this.email.send(recipient.email, subject ?? eventType, body);
    }

    await this.db.query(
      `INSERT INTO notification_logs (tenant_id, recipient_id, channel, event_type, subject, body, status, provider_msg_id, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [tenantId, recipientId, channel, eventType, subject ?? null, body,
       result.success ? "sent" : "failed", result.messageId ?? null],
    );
  }

  private interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_m, key) => vars[key] ?? `{{${key}}}`);
  }
}
