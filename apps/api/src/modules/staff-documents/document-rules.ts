/**
 * Pure document rules — no DB, no I/O, fully deterministic — so they're unit-tested directly
 * (Edge-Case Gauntlet: expiry = today, missing required fields, short numbers).
 */

export type DocStatus = "valid" | "expired" | "pending";

export interface DocTypeFlags {
  requires_number: boolean;
  requires_expiry: boolean;
}

/**
 * Status of a stored document, given the type's requirements and today's IST date.
 *   • pending  — a required number/expiry is missing (incomplete).
 *   • expired  — an expiry date strictly before today.
 *   • valid    — otherwise.
 * (`missing` is a virtual state — a mandatory type with no record at all — computed elsewhere.)
 */
export function deriveStatus(
  type: DocTypeFlags,
  fullNumber: string | null,
  expiresOn: string | null,
  todayStr: string,
): DocStatus {
  if ((type.requires_number && !fullNumber) || (type.requires_expiry && !expiresOn)) return "pending";
  if (expiresOn && expiresOn < todayStr) return "expired";
  return "valid";
}

/**
 * Masked display value for a document number. Aadhaar → `XXXX-XXXX-1234` (last 4 only); other
 * types keep the last 4 and hide the rest. The FULL number is stored encrypted separately.
 */
export function maskNumber(docType: string, raw?: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  const value = raw.trim();
  if (docType === "aadhaar") {
    const last4 = value.replace(/\D/g, "").slice(-4);
    return last4 ? `XXXX-XXXX-${last4}` : null;
  }
  const compact = value.replace(/\s/g, "");
  if (compact.length <= 4) return compact;
  return `${"X".repeat(compact.length - 4)}${compact.slice(-4)}`;
}
