import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { formatError } from "../../../common/utils/format-error";

/**
 * Transactional email delivery. Selected by EMAIL_PROVIDER:
 *   - "mock"     (default) — logs and reports success, sends nothing.
 *   - "sendgrid"           — real send via the SendGrid v3 Mail Send HTTPS API.
 *
 * SendGrid needs SENDGRID_API_KEY + EMAIL_FROM (a verified sender/domain);
 * EMAIL_FROM_NAME is optional. Like the WhatsApp provider this NEVER throws —
 * it returns { success:false } on any failure so the dispatch worker degrades
 * to in-app only instead of crashing / retrying a doomed job.
 */
@Injectable()
export class EmailProvider {
  private readonly logger = new Logger(EmailProvider.name);
  private static readonly SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send";

  constructor(private readonly config: ConfigService) {}

  /** Whether a real email backend is configured (i.e. not the mock). */
  isEnabled(): boolean {
    return this.config.get("EMAIL_PROVIDER", "mock") !== "mock";
  }

  async send(to: string, subject: string, body: string): Promise<{ success: boolean }> {
    const provider = this.config.get("EMAIL_PROVIDER", "mock");
    if (provider === "mock" || !to) {
      this.logger.debug(`[Email MOCK] To: ${to} | Subject: ${subject}`);
      return { success: true };
    }
    if (provider === "sendgrid") return this.sendViaSendgrid(to, subject, body);

    this.logger.warn(`Email provider "${provider}" not supported (use "mock" or "sendgrid")`);
    return { success: false };
  }

  private async sendViaSendgrid(to: string, subject: string, body: string): Promise<{ success: boolean }> {
    const apiKey = this.config.get<string>("SENDGRID_API_KEY");
    const from = this.config.get<string>("EMAIL_FROM");
    if (!apiKey || !from) {
      this.logger.warn("EMAIL_PROVIDER=sendgrid but SENDGRID_API_KEY / EMAIL_FROM is missing — skipping email.");
      return { success: false };
    }
    const fromName = this.config.get<string>("EMAIL_FROM_NAME") || "WorkforceIQ";

    try {
      const res = await axios.post(
        EmailProvider.SENDGRID_URL,
        {
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from, name: fromName },
          subject,
          content: [
            // Plain text first (SendGrid requires text before html); the HTML part
            // is a minimal escaped + newline-preserving wrap of the same body.
            { type: "text/plain", value: body },
            { type: "text/html", value: EmailProvider.toHtml(body) },
          ],
        },
        {
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          timeout: 15000,
        },
      );
      // SendGrid returns 202 Accepted on success.
      const ok = res.status >= 200 && res.status < 300;
      if (!ok) this.logger.warn(`SendGrid returned HTTP ${res.status} for ${to}`);
      return { success: ok };
    } catch (err) {
      this.logger.error(`SendGrid send to ${to} failed: ${formatError(err)}`);
      return { success: false };
    }
  }

  /** Escape a plain-text body and preserve line breaks for the HTML alternative. */
  private static toHtml(body: string): string {
    const escaped = body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
    return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">${escaped}</div>`;
  }
}
