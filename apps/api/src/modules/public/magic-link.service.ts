import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

export interface MagicPayload {
  staffId: string;
  weekKey: string;
  tenantId: string;
}

/**
 * Signs / verifies the read-only "My Week" magic links sent over WhatsApp to staff
 * with no login. HS256 with a DEDICATED secret (MAGIC_LINK_SECRET) — never the app's
 * JWT secret. The whole feature is disabled (sign returns null) when the secret is unset.
 */
@Injectable()
export class MagicLinkService {
  constructor(private readonly jwt: JwtService) {}

  private secret(): string | undefined {
    return process.env.MAGIC_LINK_SECRET || undefined;
  }

  isEnabled(): boolean {
    return !!this.secret();
  }

  /** Include a link for every rostered staff, not just login-less ones, when flagged. */
  linkForEveryone(): boolean {
    return process.env.MAGIC_LINK_ALL_STAFF === "true";
  }

  /** Sign a 10-day token, or null when the feature is disabled (no secret configured). */
  sign(payload: MagicPayload): string | null {
    const secret = this.secret();
    if (!secret) return null;
    return this.jwt.sign(payload, { secret, expiresIn: "10d" });
  }

  /** Verify + decode. Throws on invalid / expired / tampered (callers map to a 404). */
  verify(token: string): MagicPayload {
    const secret = this.secret();
    if (!secret) throw new Error("magic links disabled");
    return this.jwt.verify<MagicPayload>(token, { secret });
  }

  /** Full public URL (APP_URL + /w/<token>) for a payload, or null when disabled. */
  linkFor(payload: MagicPayload): string | null {
    const token = this.sign(payload);
    if (!token) return null;
    const base = (process.env.APP_URL || "").replace(/\/$/, "");
    return `${base}/w/${token}`;
  }
}
