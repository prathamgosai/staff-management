import { IsNumber, IsOptional, Min, Max } from "class-validator";

/**
 * Raw readings from navigator.geolocation — nothing else.
 *
 * There is deliberately no staffId, outletId or status here: the punch is always for the
 * caller, at the outlet on their staff record, and the verdict is decided server-side.
 * A client that could name any of those could punch for someone else, from anywhere.
 */
export class SelfPunchDto {
  @IsOptional()
  @IsNumber()
  @Min(-90) @Max(90)
  gpsLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180) @Max(180)
  gpsLng?: number;

  /** coords.accuracy in metres. Absent or too coarse sends the punch to manager review. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  gpsAccuracyM?: number;
}
