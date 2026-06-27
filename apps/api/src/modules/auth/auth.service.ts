import { Injectable, UnauthorizedException, BadRequestException, Inject, ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import * as bcrypt from "bcrypt";
import { randomInt } from "crypto";
import { DB_POOL } from "../../database/database.module";
import type { AuthUser, AuthTokens, TokenPayload } from "@workforceiq/shared";
import type { LoginDto } from "./dto/login.dto";
import type { ChangePasswordDto } from "./dto/change-password.dto";

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

  async login(dto: LoginDto): Promise<{ data: AuthUser } & AuthTokens> {
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) throw new UnauthorizedException("Invalid credentials");
    const tokens = await this.generateTokens(user);
    return { data: user, ...tokens };
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
   * Super-admin: reset a user's password. If newPassword is omitted, a temporary
   * password is generated and returned ONCE so the admin can hand it over.
   */
  async resetPassword(
    tenantId: string,
    userId: string,
    newPassword?: string,
  ): Promise<{ data: { tempPassword?: string } }> {
    const userRes = await this.db.query(
      "SELECT id FROM users WHERE id = $1 AND tenant_id = $2",
      [userId, tenantId],
    );
    if (!userRes.rows[0]) throw new BadRequestException("Account not found");

    let password = newPassword?.trim();
    const generated = !password;
    if (generated) {
      password = generateTempPassword();
    } else if (password!.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }

    const hash = await bcrypt.hash(password!, 12);
    await this.db.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3",
      [hash, userId, tenantId],
    );
    // Invalidate existing sessions so the old password can't keep one alive.
    await this.db.query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
      [userId],
    );
    return { data: generated ? { tempPassword: password } : {} };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = this.jwtService.verify<TokenPayload>(refreshToken, {
        secret: this.config.get("JWT_REFRESH_SECRET"),
      });
      const result = await this.db.query(
        "SELECT * FROM users WHERE id = $1 AND is_active = true",
        [payload.sub],
      );
      const user = result.rows[0];
      if (!user) throw new UnauthorizedException();
      return this.generateTokens(this.mapUserRow(user));
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
  }

  async logout(userId: string, _token: string): Promise<void> {
    await this.db.query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
      [userId],
    );
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    if (dto.newPassword !== dto.confirmPassword)
      throw new BadRequestException("Passwords do not match");
    const result = await this.db.query("SELECT password_hash FROM users WHERE id = $1", [userId]);
    const valid = await bcrypt.compare(dto.currentPassword, result.rows[0]?.password_hash);
    if (!valid) throw new UnauthorizedException("Current password is incorrect");
    const hash = await bcrypt.hash(dto.newPassword, 12);
    await this.db.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [hash, userId]);
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
      this.jwtService.signAsync(payload, {
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
