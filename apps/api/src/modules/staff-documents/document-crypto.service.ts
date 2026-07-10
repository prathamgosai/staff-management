import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv, createDecipheriv, randomBytes, createHmac, timingSafeEqual,
} from "crypto";

/**
 * Application-layer encryption for sensitive document material (DPDP: Aadhaar/PAN are
 * regulated PII). AES-256-GCM (authenticated) for file bytes and document numbers, plus a
 * keyed HMAC for the short-lived signed-download tokens.
 *
 * Key source: env `DOCUMENT_ENCRYPTION_KEY` — 32 bytes as hex (64 chars) or base64. When it
 * is absent (local dev with no key configured) encryption is DISABLED and callers fall back
 * to storing plaintext; `isEnabled()` lets the document service log a loud warning and skip
 * the encrypted columns. Production MUST set the key (see the Phase-1 runbook).
 *
 * Ciphertext layout: [12-byte IV][16-byte GCM tag][ciphertext].
 */
@Injectable()
export class DocumentCryptoService {
  private readonly logger = new Logger("DocumentCrypto");
  private readonly key: Buffer | null;
  private readonly signSecret: Buffer;

  constructor(config: ConfigService) {
    this.key = this.loadKey(config.get<string>("DOCUMENT_ENCRYPTION_KEY"));
    const dedicated = config.get<string>("DOCUMENT_SIGN_SECRET");
    this.signSecret = dedicated
      ? Buffer.from(dedicated, "utf8")
      : this.key ?? Buffer.from("workforceiq-dev-doc-sign", "utf8");
    if (!this.key) {
      this.logger.warn(
        "DOCUMENT_ENCRYPTION_KEY not set — document bytes/numbers will be stored UNENCRYPTED. " +
        "Set a 32-byte key (hex or base64) before handling real PII.",
      );
    }
  }

  private loadKey(raw?: string): Buffer | null {
    if (!raw || !raw.trim()) return null;
    const v = raw.trim();
    try {
      if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, "hex");
      const b = Buffer.from(v, "base64");
      if (b.length === 32) return b;
    } catch {
      /* fall through */
    }
    this.logger.error("DOCUMENT_ENCRYPTION_KEY is malformed — expected 32 bytes as hex(64) or base64. Encryption disabled.");
    return null;
  }

  isEnabled(): boolean {
    return this.key !== null;
  }

  encrypt(plain: Buffer): Buffer {
    if (!this.key) throw new Error("Encryption is not configured.");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]);
  }

  decrypt(blob: Buffer): Buffer {
    if (!this.key) throw new Error("Encryption is not configured.");
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const ct = blob.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }

  encryptString(plain: string): Buffer {
    return this.encrypt(Buffer.from(plain, "utf8"));
  }

  decryptString(blob: Buffer): string {
    return this.decrypt(blob).toString("utf8");
  }

  // ── Signed download tokens (HMAC, short-lived) ──────────────────────────────
  // A tamper-proof, expiring token so a document can be fetched over a shareable URL for a
  // few minutes without a bearer JWT. Uses DOCUMENT_SIGN_SECRET, falling back to the
  // encryption key (both are server-only secrets), resolved once in the constructor.
  signDownloadToken(documentId: string, expiresAtMs: number): string {
    const payload = `${documentId}.${expiresAtMs}`;
    const sig = createHmac("sha256", this.signSecret).update(payload).digest("base64url");
    return `${expiresAtMs}.${sig}`;
  }

  verifyDownloadToken(documentId: string, token: string, nowMs: number): boolean {
    const dot = token.indexOf(".");
    if (dot === -1) return false;
    const expiresAtMs = Number(token.slice(0, dot));
    const sig = token.slice(dot + 1);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs < nowMs) return false;
    const expected = createHmac("sha256", this.signSecret)
      .update(`${documentId}.${expiresAtMs}`)
      .digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
