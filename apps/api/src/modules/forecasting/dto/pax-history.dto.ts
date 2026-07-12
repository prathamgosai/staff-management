import { IsString, IsOptional, IsUUID, IsDateString, IsNumber, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class PaxHistoryRowDto {
  @IsOptional()
  @IsUUID()
  outletId?: string;

  @IsOptional()
  @IsString()
  outletName?: string;

  @IsDateString()
  date: string;

  @IsNumber()
  pax: number;

  // Nullable revenue: @IsOptional lets both undefined and null skip validation,
  // so an explicit null is preserved (not stripped) for the service to handle.
  @IsOptional()
  @IsNumber()
  revenue?: number | null;
}

export class ImportPaxHistoryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaxHistoryRowDto)
  rows: PaxHistoryRowDto[];
}
