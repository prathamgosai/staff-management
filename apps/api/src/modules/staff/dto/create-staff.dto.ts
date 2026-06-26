import { IsString, IsEmail, IsOptional, IsUUID, IsEnum, IsDate, IsNumber, IsBoolean } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { EmploymentType } from "@workforceiq/shared";

export class CreateStaffDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() phone: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() whatsapp?: string;
  @ApiProperty() @IsString() primaryOutletId: string;
  @ApiProperty() @IsString() departmentId: string;
  @ApiProperty() @IsString() positionId: string;
  @ApiProperty({ enum: EmploymentType }) @IsEnum(EmploymentType) employmentType: EmploymentType;
  @ApiProperty({ example: "2024-01-15" }) @IsString() joinDate: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() baseSalary?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() hourlyRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() weeklyHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() overtimeEligible?: boolean;
}
