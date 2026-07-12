import { IsString, IsOptional, IsUUID, IsDateString, IsIn } from "class-validator";

export class RequestTransferDto {
  @IsUUID()
  staffId: string;

  @IsUUID()
  fromOutletId: string;

  @IsUUID()
  toOutletId: string;

  @IsDateString()
  effectiveDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReviewTransferDto {
  @IsIn(["approve", "reject"])
  action: "approve" | "reject";
}
