import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

/**
 * Employee self-service leave request. NOTE: there is deliberately NO staffId —
 * the server always files against the caller's own staff record (from the JWT),
 * never a client-supplied id.
 */
export class CreateLeaveRequestDto {
  @ApiProperty() @IsUUID() leaveTypeId: string;
  @ApiProperty({ example: "2026-07-10" }) @IsDateString() startDate: string;
  @ApiProperty({ example: "2026-07-12" }) @IsDateString() endDate: string;
  // half_day_option is VARCHAR(2) in the schema (short codes like AM/PM) — cap at
  // 2 so an over-long value fails validation (400) instead of the INSERT (500).
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2) halfDayOption?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
