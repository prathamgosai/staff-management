import {
  IsOptional, IsInt, IsNumber, IsUUID, IsIn, IsArray, ValidateNested, Min, ArrayMaxSize, IsString, MaxLength,
} from "class-validator";
import { Type } from "class-transformer";

/** PUT /outlets/:id/configuration — all optional (partial update / upsert). */
export class UpdateConfigurationDto {
  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsOptional() @IsInt() @Min(0)
  areaSqft?: number;

  @IsOptional() @IsInt() @Min(0)
  kitchenSizeSqft?: number;

  @IsOptional() @IsInt() @Min(0)
  avgDailyPax?: number;

  @IsOptional() @IsInt() @Min(0)
  peakPax?: number;

  @IsOptional() @IsInt() @Min(0)
  lunchCapacity?: number;

  @IsOptional() @IsInt() @Min(0)
  dinnerCapacity?: number;

  @IsOptional() @IsIn(["peak_period", "average_daily"])
  paxBasis?: "peak_period" | "average_daily";

  @IsOptional() @IsNumber() @Min(0)
  tExcess?: number;

  @IsOptional() @IsNumber() @Min(0)
  tMinor?: number;
}

export class RatioRowDto {
  @IsUUID()
  positionId!: string;

  @IsNumber()
  @Min(0.01)
  guestsPerStaff!: number;

  @IsInt()
  @Min(0)
  minStaff!: number;

  @IsOptional() @IsInt() @Min(0)
  maxStaff?: number;
}

/** PUT /outlets/:id/staffing-ratios — full set of per-role ratios for the outlet. */
export class UpdateStaffRatiosDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RatioRowDto)
  ratios!: RatioRowDto[];
}

export class TemplateRowDto {
  @IsUUID()
  positionId!: string;

  @IsNumber() @Min(0.01)
  guestsPerStaff!: number;

  @IsInt() @Min(0)
  minStaff!: number;
}

/** PUT /settings/ratio-templates — templates for one restaurant category. */
export class UpdateTemplatesDto {
  @IsUUID()
  categoryId!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TemplateRowDto)
  rows!: TemplateRowDto[];
}

/** POST /outlets/:id/staffing-ratios/apply-template */
export class ApplyTemplateDto {
  @IsUUID()
  categoryId!: string;
}

/** Manage restaurant_categories lookup. */
export class UpsertCategoryDto {
  @IsString() @MaxLength(80)
  name!: string;

  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;
}
