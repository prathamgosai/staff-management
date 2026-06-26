import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

@Injectable()
export class WhatsAppProvider {
  private readonly logger = new Logger(WhatsAppProvider.name);

  constructor(private readonly config: ConfigService) {}

  async send(to: string, message: string): Promise<{ messageId?: string; success: boolean }> {
    const enabled = this.config.get("ENABLE_WHATSAPP") === "true";
    if (!enabled) {
      this.logger.debug(`[WhatsApp MOCK] To: ${to} | Message: ${message.slice(0, 60)}...`);
      return { success: true, messageId: `mock_${Date.now()}` };
    }

    try {
      const phoneNumberId = this.config.get("WHATSAPP_PHONE_NUMBER_ID");
      const token = this.config.get("WHATSAPP_ACCESS_TOKEN");
      const response = await axios.post(
        `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: message },
        },
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
      );
      return { success: true, messageId: response.data.messages?.[0]?.id };
    } catch (err) {
      this.logger.error("WhatsApp send failed", err);
      return { success: false };
    }
  }
}
