import { IsString, MinLength, Matches } from "class-validator";

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/, {
    message: "Password must contain uppercase, number, and special character",
  })
  newPassword: string;

  @IsString()
  confirmPassword: string;
}
