import { IsString, IsOptional, IsBoolean, IsInt, MaxLength, Min } from "class-validator";

/** Create/update a document_types lookup row (HR-managed). */
export class UpsertDocumentTypeDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  /** Optional stable key; derived from `name` on create when omitted. Immutable after create. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  key?: string;

  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresNumber?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresExpiry?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
