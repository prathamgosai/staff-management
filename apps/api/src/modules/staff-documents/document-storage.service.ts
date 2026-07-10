import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";

/**
 * Object-storage adapter for document bytes — **Supabase Storage** (private bucket, S3-
 * compatible), reached over its REST API with the service-role key (no extra dependency; we
 * reuse axios). We always store CIPHERTEXT here (the document service encrypts first), so a
 * bucket-ACL mistake never exposes readable PII, and downloads are always fetched + decrypted
 * server-side rather than handed to the browser as a raw signed URL.
 *
 * When Supabase env is absent (`isConfigured()===false`), the document service falls back to
 * storing the (encrypted) bytes in the `staff_documents.content_encrypted` column — so dev
 * and tests work with no external storage.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DOCUMENTS_BUCKET (default "staff-documents").
 */
@Injectable()
export class DocumentStorageService {
  private readonly logger = new Logger("DocumentStorage");
  private readonly baseUrl?: string;
  private readonly serviceKey?: string;
  private readonly bucket: string;
  private readonly http: AxiosInstance;

  constructor(config: ConfigService) {
    const url = config.get<string>("SUPABASE_URL");
    this.baseUrl = url ? `${url.replace(/\/+$/, "")}/storage/v1` : undefined;
    this.serviceKey = config.get<string>("SUPABASE_SERVICE_ROLE_KEY");
    this.bucket = config.get<string>("SUPABASE_DOCUMENTS_BUCKET", "staff-documents");
    this.http = axios.create({ timeout: 20000, maxBodyLength: Infinity, maxContentLength: Infinity });
    if (!this.isConfigured()) {
      this.logger.warn(
        "Supabase Storage not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) — " +
        "document bytes will be stored encrypted-in-DB as a fallback.",
      );
    }
  }

  isConfigured(): boolean {
    return !!this.baseUrl && !!this.serviceKey;
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey as string };
  }

  /** Deterministic object key for a document/version. */
  buildKey(tenantId: string, staffId: string, documentId: string, versionNo: number): string {
    return `${tenantId}/${staffId}/${documentId}/v${versionNo}.bin`;
  }

  async upload(objectKey: string, ciphertext: Buffer): Promise<void> {
    if (!this.isConfigured()) throw new Error("Supabase Storage is not configured.");
    await this.http.post(
      `${this.baseUrl}/object/${this.bucket}/${encodeURI(objectKey)}`,
      ciphertext,
      { headers: { ...this.headers(), "Content-Type": "application/octet-stream", "x-upsert": "true" } },
    );
  }

  async download(objectKey: string): Promise<Buffer> {
    if (!this.isConfigured()) throw new Error("Supabase Storage is not configured.");
    const res = await this.http.get(
      `${this.baseUrl}/object/authenticated/${this.bucket}/${encodeURI(objectKey)}`,
      { headers: this.headers(), responseType: "arraybuffer" },
    );
    return Buffer.from(res.data as ArrayBuffer);
  }

  /** Best-effort removal (Storage objects are pruned when a document row is soft-deleted). */
  async remove(objectKey: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      await this.http.delete(`${this.baseUrl}/object/${this.bucket}/${encodeURI(objectKey)}`, {
        headers: this.headers(),
      });
    } catch (e) {
      this.logger.warn(`Failed to remove storage object ${objectKey}: ${(e as Error).message}`);
    }
  }
}
