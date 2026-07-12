import { IsString, IsOptional, IsUUID, IsDateString, IsIn } from "class-validator";

export class ApplyLeaveDto {
  @IsUUID()
  staffId: string;

  @IsUUID()
  leaveTypeId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  halfDayOption?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReviewLeaveDto {
  @IsIn(["approve", "reject"])
  action: "approve" | "reject";

  @IsOptional()
  @IsString()
  notes?: string;
}
