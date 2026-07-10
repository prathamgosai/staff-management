import { IsString, IsIn, IsOptional, MaxLength, IsDateString } from "class-validator";

// Machine keys the API ships seeded (see document_types). HR can add more at runtime, so the
// service validates docType against the document_types table — the DTO only bounds length.
export const DOC_MIME_TYPES = [
  "application/pdf", "image/jpeg", "image/png", "image/webp",
] as const;

export class CreateDocumentDto {
  /** Document type KEY (validated against document_types for this tenant). */
  @IsString()
  @MaxLength(60)
  docType!: string;

  @IsString()
  @MaxLength(200)
  fileName!: string;

  @IsIn(DOC_MIME_TYPES)
  mimeType!: (typeof DOC_MIME_TYPES)[number];

  /**
   * Base64 payload of the file — raw base64 or a full data URL ("data:...;base64,XXXX"); the
   * service strips the prefix. First-line length guard only (~15 MB string ≈ 11 MB binary);
   * the service enforces the real decoded cap (default 10 MB, MAX_DOCUMENT_BYTES) → 413.
   */
  @IsString()
  @MaxLength(15_000_000, { message: "File is too large." })
  contentBase64!: string;

  /** Optional document number. Stored app-encrypted (full) + a masked display value. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  docNumber?: string;

  /** Optional expiry (licenses/passports), ISO date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  expiresOn?: string;

  /** Optional free-text note. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
