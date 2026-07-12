import { IsString, IsOptional, IsUUID, IsDateString, IsNumber, IsIn } from "class-validator";

export class ClockInDto {
  @IsUUID()
  staffId: string;

  @IsUUID()
  outletId: string;

  @IsOptional()
  @IsUUID()
  shiftId?: string;

  // Optional so a caller that omits it isn't rejected by the global whitelist pipe; the
  // service treats a missing method as the default. (Was required in the old inline type.)
  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsNumber()
  gpsLat?: number;

  @IsOptional()
  @IsNumber()
  gpsLng?: number;
}

export class ClockOutDto {
  @IsUUID()
  attendanceId: string;

  // Optional so a caller that omits it isn't rejected by the global whitelist pipe; the
  // service treats a missing method as the default. (Was required in the old inline type.)
  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsNumber()
  gpsLat?: number;

  @IsOptional()
  @IsNumber()
  gpsLng?: number;
}

export class ManualEntryDto {
  @IsUUID()
  staffId: string;

  @IsUUID()
  outletId: string;

  @IsDateString()
  date: string;

  @IsString()
  clockIn: string;

  @IsOptional()
  @IsString()
  clockOut?: string;

  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class RequestCorrectionDto {
  @IsUUID()
  attendanceId: string;

  @IsOptional()
  @IsString()
  correctedClockIn?: string;

  @IsOptional()
  @IsString()
  correctedClockOut?: string;

  @IsString()
  reason: string;
}

export class ReviewCorrectionDto {
  @IsIn(["approve", "reject"])
  action: "approve" | "reject";
}
