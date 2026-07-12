import { IsString, IsOptional, IsNumber, IsObject } from "class-validator";

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
