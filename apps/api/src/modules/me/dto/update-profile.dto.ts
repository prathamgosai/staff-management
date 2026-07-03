import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";

/** Emergency contact is the only nested object an employee may edit. */
export class EmergencyContactDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) relationship?: string;
}

/**
 * Self-service profile edit. ONLY phone, emergency contact and photo. Employee
 * code, email, role, post, outlet, status and pay are intentionally absent —
 * with the global ValidationPipe's whitelist they are rejected, not silently
 * ignored, if a client tries to smuggle them in.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) phone?: string;

  @ApiPropertyOptional({ type: EmergencyContactDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmergencyContactDto)
  emergencyContact?: EmergencyContactDto;

  // Base64 data-URL or a URL; an empty string clears the photo.
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5_000_000) avatarUrl?: string;
}
