import { IsString, IsOptional, IsIn, IsArray, IsUUID } from "class-validator";

export class RegisterDto {
  @IsString()
  name: string;

  @IsString()
  email: string;

  @IsString()
  password: string;

  @IsString()
  confirmPassword: string;
}

export class ReviewRegistrationDto {
  @IsIn(["approve", "reject"])
  action: "approve" | "reject";
}

export class ResetPasswordDto {
  @IsOptional()
  @IsString()
  newPassword?: string;
}

export class SetAccountOutletsDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  outletIds: string[];
}

export class ChangeAccountRolesDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  userIds: string[];

  @IsString()
  role: string;
}
