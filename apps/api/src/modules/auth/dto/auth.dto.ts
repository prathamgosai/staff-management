import { IsString, IsOptional, IsIn, IsArray, IsUUID } from "class-validator";
import { IsDbUuidArray } from "../../../common/validators/is-db-uuid";

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
  // IsDbUuidArray, not @IsUUID({each}): outlet ids are seeded with a 0 version digit, which
  // the strict validator rejects — this endpoint 400'd on every real outlet.
  @IsArray()
  @IsDbUuidArray()
  outletIds: string[];
}

export class ChangeAccountRolesDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  userIds: string[];

  @IsString()
  role: string;
}
