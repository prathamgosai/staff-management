import { IsString, IsOptional, IsUUID, IsNumber } from "class-validator";

export class CreateDepartmentDto {
  @IsUUID()
  outletId: string;

  @IsString()
  name: string;
}

export class CreatePositionDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsNumber()
  level?: number;

  @IsOptional()
  @IsNumber()
  defaultHoursWeek?: number;
}
