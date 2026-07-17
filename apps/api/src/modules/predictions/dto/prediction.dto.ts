import {
  IsOptional, IsString, IsNumber, IsInt, Min, MaxLength,
} from "class-validator";

/**
 * areaSqft and operatingHours were removed: both were validated here and then never read by
 * the strategy, so the form invited a planner to tune numbers that could not move the answer.
 * There is no defensible staff-per-sqft or staff-per-operating-hour ratio to derive without
 * measured data, so they are gone rather than left as decoration.
 */
export class RunPredictionDto {
  @IsOptional() @IsString() @MaxLength(80)
  categoryName?: string;

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
}

