import { Injectable, UnauthorizedException, BadRequestException, Inject, ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import * as bcrypt from "bcrypt";
import { randomInt, createHash, randomUUID } from "crypto";
import { DB_POOL } from "../../database/database.module";
import type { AuthUser, AuthTokens, TokenPayload } from "@workforceiq/shared";
import { ASSIGNABLE_ROLES } from "@workforceiq/shared";
import type { LoginDto } from "./dto/login.dto";
import type { ChangePasswordDto } from "./dto/change-password.dto";
import { RolesService } from "../roles/roles.service";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";

function generateTicket(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `WIQ-${ymd}-${rand}`;
}

// Readable temporary password (no ambiguous chars like 0/O, 1/l/I).
function generateTempPassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let p = "";
  for (let i = 0; i < length; i++) p += chars[randomInt(chars.length)];
  return p;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB_POOL) private readonly db: Pool,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly rolesService: RolesService,
  ) {}

  async validateUser(email: string, password: string): Promise<AuthUser | null> {
    const result = await this.db.query(
      "SELECT * FROM users WHERE email = $1",
      [email.toLowerCase()],
    );
    const user = result.rows[0];
    if (!user || !user.password_hash) return null;

    if (user.pending_approval) {
      throw new ForbiddenException(`Your account is pending approval. Ticket: ${user.ticket_number}`);
    }
    if (!user.is_active) {
      throw new ForbiddenException("Your account has been deactivated. Please contact your manager.");
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return null;
    await this.db.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);
    return this.mapUserRow(user);
  }

  async login(dto: LoginDto): Promise<{ data: AuthUser; mustChangePassword: boolean } & AuthTokens> {
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) throw new UnauthorizedException("Invalid credentials");
    const tokens = await this.generateTokens(user);
    await this.persistRefreshToken(user.id, tokens.refreshToken);
    const mustChangePassword = await this.getMustChangePassword(user.id);
    // Stamp effective permissions so the SPA can gate its UI right after login.
    const permissions = await this.rolesService.getPermissionsForRole(user.tenantId, user.role);
    return { data: { ...user, permissions }, mustChangePassword, ...tokens };
  }

  async register(body: { name: string; email: string; password: string; confirmPassword: string }): Promise<{ message: string; ticket: string }> {
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();

    if (!name || name.length < 2) throw new BadRequestException("Please enter your full name");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException("Please enter a valid email address");
    if (body.password !== body.confirmPassword) throw new BadRequestException("Passwords do not match");
    if (body.password.length < 8) throw new BadRequestException("Password must be at least 8 characters");

    // Check email already exists
    const existing = await this.db.query(
      "SELECT id, pending_approval, is_active FROM users WHERE email = $1 AND tenant_id = $2",
      [email, TENANT_ID],
    );
    if (existing.rows[0]) {
      const u = existing.rows[0];
      if (u.pending_approval) throw new BadRequestException("A registration with this email is already pending approval.");
      throw new BadRequestException("An account with this email already exists. Please sign in.");
    }

    const hash = await bcrypt.hash(body.password, 12);
    const ticket = generateTicket();

    await this.db.query(
      `INSERT INTO users (tenant_id, email, name, password_hash, role, outlet_ids, is_active, pending_approval, ticket_number)
       VALUES ($1, $2, $3, $4, 'employee'::user_role, '{}', false, true, $5)`,
      [TENANT_ID, email, name, hash, ticket],
    );

    return {
      message: "Registration submitted successfully. Your Head Chef will review and approve your account.",
      ticket,
    };
  }

  async getPendingRegistrations() {
    const result = await this.db.query(
      `SELECT u.id, u.name, u.email, u.created_at, u.ticket_number,
              s.employee_id, s.employment_type,
              o.name AS outlet_name, p.name AS position_name
       FROM users u
       LEFT JOIN staff s ON s.user_id = u.id
       LEFT JOIN outlets o ON o.id = s.current_outlet_id
       LEFT JOIN positions p ON p.id = s.position_id
       WHERE u.tenant_id = $1 AND u.pending_approval = true
       ORDER BY u.created_at DESC`,
      [TENANT_ID],
    );
    return { data: result.rows };
  }

  async reviewRegistration(userId: string, action: "approve" | "reject"): Promise<void> {
    const userResult = await this.db.query("SELECT id, pending_approval FROM users WHERE id = $1", [userId]);
    if (!userResult.rows[0]) throw new BadRequestException("User not found");
    if (!userResult.rows[0].pending_approval) throw new BadRequestException("This account is not pending approval");

    if (action === "approve") {
      await this.db.query(
        "UPDATE users SET is_active = true, pending_approval = false, updated_at = NOW() WHERE id = $1",
        [userId],
      );
    } else {
      await this.db.query("UPDATE staff SET user_id = NULL WHERE user_id = $1", [userId]);
      await this.db.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  }

  /** Super-admin: list every account with login ID, role and status. Never returns passwords. */
  async getAllAccounts(tenantId: string) {
    const result = await this.db.query(
      `SELECT u.id, u.email, u.name, u.role, u.is_active, u.pending_approval,
              u.ticket_number, u.last_login_at, u.created_at,
              s.employee_id
       FROM users u
       LEFT JOIN staff s ON s.user_id = u.id
       WHERE u.tenant_id = $1
       ORDER BY u.pending_approval DESC, u.is_active ASC, u.name`,
      [tenantId],
    );
    return { data: result.rows };
  }

  /**
   * Reset a user's password. If newPassword is omitted, a temporary password is
   * generated and returned ONCE so the admin can hand it over.
   * A Super Admin account's password can ONLY be reset by a Super Admin — no
   * other account type (Admin, HR, …) may touch it.
   */
  async resetPassword(
    actor: AuthUser,
    userId: string,
    newPassword?: string,
  ): Promise<{ data: { tempPassword?: string } }> {
    const tenantId = actor.tenantId;
    const userRes = await this.db.query(
      "SELECT id, role FROM users WHERE id = $1 AND tenant_id = $2",
      [userId, tenantId],
    );
    if (!userRes.rows[0]) throw new BadRequestException("Account not found");
    if (userRes.rows[0].role === "super_admin" && actor.role !== "super_admin") {
      throw new ForbiddenException("Only a Super Admin can reset a Super Admin password.");
    }

    let password = newPassword?.trim();
    const generated = !password;
    if (generated) {
      password = generateTempPassword();
    } else if (password!.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }

    const hash = await bcrypt.hash(password!, 12);
    // Force the user to set their own password the next time they sign in.
    await this.db.query(
      "UPDATE users SET password_hash = $1, must_change_password = true, updated_at = NOW() WHERE id = $2 AND tenant_id = $3",
      [hash, userId, tenantId],
    );
    // Invalidate existing sessions so the old password can't keep one alive.
    await this.db.query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
      [userId],
    );
    return { data: generated ? { tempPassword: password } : {} };
  }

  /**
   * super_admin / HR: reassign the account role for one or more staff. The new
   * role must be assignable (never super_admin), and existing super_admin
   * accounts are protected — they can't be reassigned here. New permissions take
   * effect on each affected user's next request (JwtStrategy reads them live).
   */
  async changeRoles(tenantId: string, userIds: string[], role: string): Promise<{ data: { updated: number } }> {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new BadRequestException("No accounts selected.");
    }
    if (!(ASSIGNABLE_ROLES as string[]).includes(role)) {
      throw new BadRequestException(`Cannot assign role: ${role}`);
    }
    const supers = await this.db.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND role = 'super_admin'",
      [tenantId, userIds],
    );
    if (supers.rows[0].n > 0) {
      throw new BadRequestException("Super Admin accounts cannot be reassigned.");
    }
    const res = await this.db.query(
      "UPDATE users SET role = $3::user_role, updated_at = NOW() WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND role <> 'super_admin' RETURNING id",
      [tenantId, userIds, role],
    );
    return { data: { updated: res.rowCount ?? 0 } };
  }

  /**
   * Rotate the refresh token: the presented token must be a valid JWT AND a
   * live row in refresh_tokens. On success we revoke that row and issue a brand
   * new pair (single-use refresh tokens). A token that verifies but has no live
   * row — i.e. one already rotated/revoked, or issued before rotation existed —
   * is rejected so a stale/replayed token can't mint new sessions.
   */
  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    let payload: TokenPayload;
    try {
      payload = this.jwtService.verify<TokenPayload>(refreshToken, {
        secret: this.config.get("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.db.query(
      "SELECT id FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()",
      [tokenHash],
    );
    if (!stored.rows[0]) throw new UnauthorizedException("Refresh token is no longer valid");

    const result = await this.db.query(
      "SELECT * FROM users WHERE id = $1 AND is_active = true",
      [payload.sub],
    );
    const user = result.rows[0];
    if (!user) throw new UnauthorizedException();

    // Revoke the used token, then issue + persist a fresh one.
    await this.db.query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1", [stored.rows[0].id]);
    const tokens = await this.generateTokens(this.mapUserRow(user));
    await this.persistRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async logout(userId: string, _token: string): Promise<void> {
    await this.db.query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
      [userId],
    );
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<AuthTokens> {
    if (dto.newPassword !== dto.confirmPassword)
      throw new BadRequestException("Passwords do not match");
    if (dto.newPassword.length < 8)
      throw new BadRequestException("Password must be at least 8 characters");
    const result = await this.db.query("SELECT * FROM users WHERE id = $1", [userId]);
    const userRow = result.rows[0];
    const valid = await bcrypt.compare(dto.currentPassword, userRow?.password_hash);
    if (!valid) throw new UnauthorizedException("Current password is incorrect");
    if (dto.newPassword === dto.currentPassword)
      throw new BadRequestException("New password must be different from the current one");
    const hash = await bcrypt.hash(dto.newPassword, 12);
    await this.db.query(
      "UPDATE users SET password_hash = $1, must_change_password = false, updated_at = NOW() WHERE id = $2",
      [hash, userId],
    );
    // Revoke every existing session (logs out other devices)…
    await this.db.query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
      [userId],
    );
    // …then issue a fresh pair so THIS session stays signed in instead of being
    // silently logged out when its access token expires.
    const tokens = await this.generateTokens(this.mapUserRow(userRow));
    await this.persistRefreshToken(userId, tokens.refreshToken);
    return tokens;
  }

  /** Store a one-way hash of a refresh token so it can be rotated/revoked server-side. */
  private async persistRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const decoded = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.db.query(
      "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
      [userId, this.hashToken(refreshToken), expiresAt],
    );
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async getMustChangePassword(userId: string): Promise<boolean> {
    const r = await this.db.query("SELECT must_change_password FROM users WHERE id = $1", [userId]);
    return r.rows[0]?.must_change_password === true;
  }

  private async generateTokens(user: AuthUser): Promise<AuthTokens> {
    const payload: Omit<TokenPayload, "iat" | "exp"> = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      outletIds: user.outletIds,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      // A unique jti makes every refresh token distinct even when issued in the
      // same second, so rotation produces a genuinely new token each time.
      this.jwtService.signAsync({ ...payload, jti: randomUUID() }, {
        secret: this.config.get("JWT_REFRESH_SECRET"),
        expiresIn: this.config.get("JWT_REFRESH_EXPIRES_IN", "7d"),
      }),
    ]);
    return { accessToken, refreshToken, expiresIn: 900 };
  }

  private mapUserRow(row: Record<string, unknown>): AuthUser {
    return {
      id: row.id as string,
      email: row.email as string,
      name: row.name as string,
      role: row.role as AuthUser["role"],
      outletIds: (row.outlet_ids as string[]) ?? [],
      tenantId: row.tenant_id as string,
      avatarUrl: row.avatar_url as string | undefined,
    };
  }
}
