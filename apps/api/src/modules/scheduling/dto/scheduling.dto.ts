import { IsString, IsOptional, IsUUID, IsDateString, IsNumber, IsArray, IsIn } from "class-validator";
import { IsDbUuid } from "../../../common/validators/is-db-uuid";

export class GenerateScheduleDto {
  @IsDbUuid()
  outletId: string;

  @IsDateString()
  weekStartDate: string;
}

export class AssignStaffDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  staffIds: string[];
}

export class UpdateTemplateDto {
  @IsString()
  startTime: string;

  @IsString()
  endTime: string;

  @IsOptional()
  @IsNumber()
  breakMinutes?: number;

  @IsOptional()
  @IsDateString()
  fromWeekStartDate?: string;
}

export class MoveStaffDto {
  @IsDbUuid()
  outletId: string;

  @IsUUID()
  staffId: string;

  @IsUUID()
  templateId: string;

  @IsDateString()
  weekStartDate: string;
}

export class RequestSwapDto {
  @IsUUID()
  requesterShiftId: string;

  @IsOptional()
  @IsUUID()
  targetStaffId?: string;

  @IsOptional()
  @IsUUID()
  targetShiftId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReviewSwapDto {
  @IsIn(["approve", "reject"])
  action: "approve" | "reject";
}
