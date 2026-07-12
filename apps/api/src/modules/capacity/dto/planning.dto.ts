import { IsOptional, IsNumber } from "class-validator";

export class StaffingProjectionDto {
  @IsOptional()
  @IsNumber()
  plannedPax?: number;

  @IsOptional()
  @IsNumber()
  plannedTables?: number;
}
