import { IsString, IsOptional, IsUUID, IsDateString, IsNumber, IsIn, Min, Max } from "class-validator";
import { IsDbUuid } from "../../../common/validators/is-db-uuid";

export class ClockInDto {
  @IsUUID()
  staffId: string;

  @IsDbUuid()
  outletId: string;

  @IsOptional()
  @IsUUID()
  shiftId?: string;

  // Optional so a caller that omits it isn't rejected by the global whitelist pipe; the
  // service treats a missing method as the default. (Was required in the old inline type.)
  @IsOptional()
  @IsString()
  method?: string;

  // Raw readings only. The client never sends a verdict — the geofence decision is made
  // server-side in evaluateGeofence() against coordinates stored on the outlet.
  @IsOptional()
  @IsNumber()
  @Min(-90) @Max(90)
  gpsLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180) @Max(180)
  gpsLng?: number;

  /** navigator.geolocation coords.accuracy, in metres. A punch without it can't be trusted. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  gpsAccuracyM?: number;
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

  @IsDbUuid()
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

  // The MARKING MANAGER's position, captured by the browser when they press Save. Evidences
  // that attendance was recorded at the outlet rather than off-site.
  @IsOptional()
  @IsNumber()
  @Min(-90) @Max(90)
  gpsLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180) @Max(180)
  gpsLng?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  gpsAccuracyM?: number;
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
