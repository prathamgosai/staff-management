import { PartialType } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { EmploymentStatus } from "@workforceiq/shared";
import { CreateStaffDto } from "./create-staff.dto";

export class UpdateStaffDto extends PartialType(CreateStaffDto) {
  @IsOptional() @IsEnum(EmploymentStatus) employmentStatus?: EmploymentStatus;

  // employee_id is VARCHAR(30) NOT NULL and UNIQUE per tenant
  @IsOptional() @IsString() @MinLength(1) @MaxLength(30) employeeId?: string;
}
