import { IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
  // `email` is really a login IDENTIFIER — a real email, a staff Employee ID, or the
  // short admin/HR login id. authenticate() resolves all three, so it must NOT be
  // constrained to a strict email (that's what forced the web to mangle Employee IDs).
  @ApiProperty({ example: "admin@workforceiq.app", description: "Email, Employee ID, or login id" })
  @IsString()
  @MinLength(1)
  email: string;

  @ApiProperty({ example: "Admin@123" })
  @IsString()
  @MinLength(6)
  password: string;
}
