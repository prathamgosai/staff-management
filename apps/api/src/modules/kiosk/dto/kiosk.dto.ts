import { IsString, IsUUID, ValidateIf } from "class-validator";

export class CreateDeviceDto {
  @IsUUID()
  outletId: string;

  @IsString()
  label: string;
}

export class SetStaffPinDto {
  // Nullable + required: a null clears the PIN, so null must pass through. ValidateIf
  // skips @IsString only when the value is exactly null; undefined/absent still fails.
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  pin: string | null;
}

export class KioskClockDto {
  @IsString()
  employeeId: string;

  @IsString()
  pin: string;
}
