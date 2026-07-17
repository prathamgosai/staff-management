import { IsString, IsOptional, IsNumber, IsObject, IsInt, Min, Max } from "class-validator";

export class CreateOutletDto {
  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  brandName?: string;

  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsObject()
  address: Record<string, string>;

  @IsObject()
  contact: Record<string, string>;

  @IsOptional()
  @IsNumber()
  seatingCapacity?: number;
}

export class UpdateOutletLocationDto {
  // Both nullable together: clearing one clears the geofence entirely (a latitude with no
  // longitude is not a location — the DB enforces this too).
  @IsOptional()
  @IsNumber()
  @Min(-90) @Max(90)
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180) @Max(180)
  longitude?: number | null;

  /** Per-outlet: a mall unit needs a wider fence than a standalone cafe. DB caps at 25-2000m. */
  @IsOptional()
  @IsInt()
  @Min(25) @Max(2000)
  geofenceRadiusM?: number;
}

export class UpdateCapacityDto {
  // Nullable: @IsOptional lets undefined and null skip validation, so an explicit
  // null is preserved for the service (which distinguishes null from undefined).
  @IsOptional()
  @IsNumber()
  totalTables?: number | null;

  @IsOptional()
  @IsNumber()
  maxPax?: number | null;
}
