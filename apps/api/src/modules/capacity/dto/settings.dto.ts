import { IsString, IsOptional, IsNumber, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class StaffingRatioDto {
  @IsString()
  category: string;

  @IsNumber()
  paxPerStaff: number;

  @IsNumber()
  minStaff: number;
}

export class UpdateRatiosDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffingRatioDto)
  ratios?: StaffingRatioDto[];

  @IsOptional()
  @IsNumber()
  coversPerOnDutyStaff?: number;
}
