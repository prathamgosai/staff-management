import { PartialType } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";
import { EmploymentStatus } from "@workforceiq/shared";
import { CreateStaffDto } from "./create-staff.dto";

export class UpdateStaffDto extends PartialType(CreateStaffDto) {
  @IsOptional() @IsEnum(EmploymentStatus) employmentStatus?: EmploymentStatus;
}
