/**
 * Server-side file-type validation by MAGIC BYTES (content sniffing) — never trust the
 * client-declared MIME type or the filename extension alone. A crafted `.png` carrying PDF
 * bytes (or vice-versa) is rejected. Pure functions, no I/O — unit-tested directly.
 *
 * Supported types mirror the staff_documents mime CHECK: pdf, jpeg, png, webp.
 */

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

const EXT_BY_MIME: Record<AllowedMime, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

/** Detect the real MIME from the leading bytes; returns null if unrecognised. */
export function sniffMime(buf: Buffer): AllowedMime | null {
  if (!buf || buf.length < 12) return null;
  // %PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return "application/pdf";
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "image/png";
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

export interface SignatureCheck {
  ok: boolean;
  /** Machine reason on failure — safe for logs (no PII). */
  reason?: "empty" | "unknown_type" | "mime_mismatch" | "extension_mismatch";
  detectedMime?: AllowedMime;
}

/**
 * Validate that (a) the bytes are one of the allowed types, (b) the detected type matches
 * the client-declared MIME, and (c) the filename extension is consistent with that type.
 */
export function validateSignature(
  buf: Buffer,
  declaredMime: string,
  fileName: string,
): SignatureCheck {
  if (!buf || buf.length === 0) return { ok: false, reason: "empty" };
  const detected = sniffMime(buf);
  if (!detected) return { ok: false, reason: "unknown_type" };
  if (detected !== declaredMime) return { ok: false, reason: "mime_mismatch", detectedMime: detected };
  const ext = extensionOf(fileName);
  if (ext && !EXT_BY_MIME[detected].includes(ext)) {
    return { ok: false, reason: "extension_mismatch", detectedMime: detected };
  }
  return { ok: true, detectedMime: detected };
}
