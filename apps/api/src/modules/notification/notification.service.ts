import { Injectable, Inject } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";

@Injectable()
export class NotificationService {
  constructor(
    @Inject(DB_POOL) private readonly db: Pool,
    @InjectQueue("notifications") private readonly queue: Queue,
  ) {}

  async send(payload: {
    tenantId: string;
    recipientIds: string[];
    eventType: string;
    channels: string[];
    variables: Record<string, string>;
  }) {
    for (const recipientId of payload.recipientIds) {
      for (const channel of payload.channels) {
        await this.queue.add("send", { ...payload, recipientId, channel });
      }
    }
    return { data: { queued: payload.recipientIds.length * payload.channels.length } };
  }

  async getLogs(tenantId: string, recipientId?: string, limit = 50) {
    const result = await this.db.query(
      `SELECT * FROM notification_logs
       WHERE tenant_id = $1 ${recipientId ? "AND recipient_id = $2" : ""}
       ORDER BY created_at DESC LIMIT $${recipientId ? 3 : 2}`,
      recipientId ? [tenantId, recipientId, limit] : [tenantId, limit],
    );
    return { data: result.rows };
  }

  async getPreferences(staffId: string) {
    const result = await this.db.query(
      "SELECT * FROM notification_preferences WHERE staff_id = $1",
      [staffId],
    );
    return { data: result.rows };
  }

  async upsertPreference(staffId: string, channel: string, eventType: string, enabled: boolean) {
    await this.db.query(
      `INSERT INTO notification_preferences (staff_id, channel, event_type, enabled)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (staff_id, channel, event_type) DO UPDATE SET enabled = $4`,
      [staffId, channel, eventType, enabled],
    );
    return { data: { updated: true } };
  }
}
