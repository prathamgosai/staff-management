import type { Role } from "../constants/roles";
import type { UUID, ISODateTime } from "./common";

export interface AuthUser {
  id: UUID;
  email: string;
  name: string;
  role: Role;
  outletIds: UUID[];
  tenantId: UUID;
  avatarUrl?: string;
  // Effective permission keys for this user's role (from the editable matrix).
  // super_admin carries ["*"], meaning every permission. May be absent on
  // older cached sessions until the user's next login / token refresh.
  permissions?: string[];
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TokenPayload {
  sub: UUID;
  email: string;
  role: Role;
  tenantId: UUID;
  outletIds: UUID[];
  iat: number;
  exp: number;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface Session {
  id: UUID;
  userId: UUID;
  deviceInfo?: string;
  ipAddress?: string;
  lastActiveAt: ISODateTime;
  expiresAt: ISODateTime;
}
