import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class EmailProvider {
  private readonly logger = new Logger(EmailProvider.name);

  constructor(private readonly config: ConfigService) {}

  async send(to: string, subject: string, body: string): Promise<{ success: boolean }> {
    const provider = this.config.get("EMAIL_PROVIDER", "mock");
    if (provider === "mock" || !to) {
      this.logger.debug(`[Email MOCK] To: ${to} | Subject: ${subject}`);
      return { success: true };
    }
    // Real implementation: AWS SES or SendGrid
    // Plug in SDK calls here in Phase 1
    this.logger.warn(`Email provider "${provider}" not yet implemented`);
    return { success: false };
  }
}
