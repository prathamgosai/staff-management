import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { formatError } from "../../../common/utils/format-error";

/**
 * WhatsApp delivery via the Meta Cloud (Graph) API. Real sends require
 * ENABLE_WHATSAPP=true plus WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID.
 * The notification worker only calls this after checking `isEnabled()`, so a
 * disabled channel is skipped (and falls back to email) rather than mock-sent.
 */
@Injectable()
export class WhatsAppProvider {
  private readonly logger = new Logger(WhatsAppProvider.name);

  constructor(private readonly config: ConfigService) {}

  /** Whether real WhatsApp delivery is switched on for this environment. */
  isEnabled(): boolean {
    return this.config.get("ENABLE_WHATSAPP") === "true";
  }

  private endpoint(): string {
    const base = this.config.get("WHATSAPP_API_URL") || "https://graph.facebook.com/v19.0";
    const phoneNumberId = this.config.get("WHATSAPP_PHONE_NUMBER_ID");
    return `${base.replace(/\/$/, "")}/${phoneNumberId}/messages`;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.config.get("WHATSAPP_ACCESS_TOKEN")}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Send an approved Utility template. `bodyParams` fill the template's {{1}}..{{n}}
   * body variables in order. Returns success:false on any failure so the worker
   * can fall back to email — it never throws.
   */
  async sendTemplate(
    to: string,
    templateName: string,
    lang: string,
    bodyParams: string[],
  ): Promise<{ success: boolean; messageId?: string }> {
    try {
      const response = await axios.post(
        this.endpoint(),
        {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: lang },
            components: bodyParams.length
              ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
              : [],
          },
        },
        { headers: this.headers(), timeout: 15000 },
      );
      return { success: true, messageId: response.data?.messages?.[0]?.id };
    } catch (err) {
      this.logger.error(`WhatsApp template "${templateName}" failed: ${formatError(err)}`);
      return { success: false };
    }
  }

  /**
   * Plain-text send (legacy path). Kept for the older template-driven flow; the
   * new notification worker uses sendTemplate. Mocks a success when disabled.
   */
  async send(to: string, message: string): Promise<{ messageId?: string; success: boolean }> {
    if (!this.isEnabled()) {
      this.logger.debug(`[WhatsApp MOCK] To: ${to} | ${message.slice(0, 60)}...`);
      return { success: true, messageId: "mock" };
    }
    try {
      const response = await axios.post(
        this.endpoint(),
        { messaging_product: "whatsapp", to, type: "text", text: { body: message } },
        { headers: this.headers(), timeout: 15000 },
      );
      return { success: true, messageId: response.data?.messages?.[0]?.id };
    } catch (err) {
      this.logger.error(`WhatsApp send failed: ${formatError(err)}`);
      return { success: false };
    }
  }
}
