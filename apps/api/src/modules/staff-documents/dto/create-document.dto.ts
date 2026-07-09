import { IsString, IsIn, IsOptional, MaxLength, IsDateString } from "class-validator";

// Kept in sync with the CHECK constraints in 016_staff_documents.sql.
export const DOC_TYPES = [
  "aadhaar", "pan", "bank_passbook", "driving_license", "passport",
  "voter_id", "police_verification", "contract", "other",
] as const;

export const DOC_MIME_TYPES = [
  "application/pdf", "image/jpeg", "image/png", "image/webp",
] as const;

export class CreateDocumentDto {
  @IsIn(DOC_TYPES)
  docType!: (typeof DOC_TYPES)[number];

  @IsString()
  @MaxLength(200)
  fileName!: string;

  @IsIn(DOC_MIME_TYPES)
  mimeType!: (typeof DOC_MIME_TYPES)[number];

  /**
   * Base64 payload of the file — either the raw base64 or a full data URL
   * ("data:...;base64,XXXX"); the service strips the prefix. First-line length
   * guard only (~3.5 MB string ≈ 2.6 MB binary); the service enforces the real
   * 2 MB DECODED cap and returns 413 beyond it.
   */
  @IsString()
  @MaxLength(3_600_000, { message: "File is too large. Maximum size is 2 MB." })
  contentBase64!: string;

  /** Optional document number. For aadhaar the server persists only the last 4 digits. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  docNumber?: string;

  /** Optional expiry (licenses/passports), ISO date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  expiresOn?: string;
}
