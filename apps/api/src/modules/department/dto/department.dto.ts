import { IsString, IsOptional, IsUUID, IsNumber } from "class-validator";
import { IsDbUuid } from "../../../common/validators/is-db-uuid";

export class CreateDepartmentDto {
  @IsDbUuid()
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
