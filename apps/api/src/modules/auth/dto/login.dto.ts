import { IsEmail, IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({ example: "admin@workforceiq.app" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "Admin@123" })
  @IsString()
  @MinLength(6)
  password: string;
}
