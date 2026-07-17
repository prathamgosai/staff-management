import { IsString, IsOptional, IsUUID, IsDateString, IsNumber, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { IsDbUuid } from "../../../common/validators/is-db-uuid";

export class GenerateForecastDto {
  @IsDbUuid()
  outletId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  model?: string;
}

export class PaxDataItemDto {
  @IsDateString()
  date: string;

  @IsNumber()
  hour: number;

  @IsNumber()
  paxCount: number;

  @IsOptional()
  @IsNumber()
  revenue?: number;
}

export class IngestPaxDataDto {
  @IsDbUuid()
  outletId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaxDataItemDto)
  data: PaxDataItemDto[];
}
