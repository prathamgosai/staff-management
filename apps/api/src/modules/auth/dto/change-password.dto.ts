import { IsString, MinLength, Matches } from "class-validator";

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  // Policy: at least 10 characters, including at least one letter and one digit.
  // The server additionally rejects the burned-password denylist and any value
  // equal to the current password — see AuthService.changePassword.
  @IsString()
  @MinLength(10)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{10,}$/, {
    message: "Password must be at least 10 characters and include a letter and a number",
  })
  newPassword: string;

  @IsString()
  confirmPassword: string;
}
