import {
  IsOptional, IsString, IsNumber, IsInt, IsUUID, IsArray, ValidateNested, Min, ArrayMaxSize, MaxLength,
} from "class-validator";
import { Type } from "class-transformer";

export class RunPredictionDto {
  @IsOptional() @IsString() @MaxLength(80)
  categoryName?: string;

  @IsOptional() @IsInt() @Min(0)
  areaSqft?: number;

  @IsOptional() @IsInt() @Min(0)
  totalSeating?: number;

  @IsOptional() @IsInt() @Min(0)
  expectedLunchPax?: number;

  @IsOptional() @IsInt() @Min(0)
  expectedDinnerPax?: number;

  @IsOptional() @IsInt() @Min(0)
  expectedDailyPax?: number;

  @IsOptional() @IsNumber() @Min(0)
  expectedAvgBill?: number;

  @IsOptional() @IsString() @MaxLength(120)
  operatingHours?: string;
}

export class RoleSalaryRowDto {
  @IsUUID()
  positionId!: string;

  @IsNumber() @Min(0)
  avgMonthlySalary!: number;
}

export class UpdateSalariesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RoleSalaryRowDto)
  salaries!: RoleSalaryRowDto[];
}
