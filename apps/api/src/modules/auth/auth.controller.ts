import { Controller, Post, Put, Body, Get, UseGuards, Req, HttpCode, HttpStatus, Param } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ROLES, type AuthUser } from "@workforceiq/shared";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // Brute-force protection. Behind the web app's same-origin /api proxy, every
  // login shares one source IP (the web server), so this bucket is effectively
  // global — set high enough for a whole team to sign in within a minute, but
  // low enough to throttle a password-guessing bot hitting the API directly.
  // Tune without a code change via the LOGIN_RATE_LIMIT env var.
  @Throttle({ default: { limit: Number(process.env.LOGIN_RATE_LIMIT) || 20, ttl: 60_000 } })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Login with email and password" })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Staff self-registration — account pending Head Chef approval" })
  register(@Body() body: { name: string; email: string; password: string; confirmPassword: string }) {
    return this.authService.register(body);
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Refresh access token" })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  logout(@Req() req: { user: AuthUser; headers: { authorization?: string } }) {
    return this.authService.logout(req.user.id, req.headers.authorization?.split(" ")[1] ?? "");
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current authenticated user" })
  me(@CurrentUser() user: AuthUser) {
    return { data: user };
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  @ApiBearerAuth()
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission("accounts:manage")
  @Get("pending-registrations")
  @ApiBearerAuth()
  @ApiOperation({ summary: "List staff accounts pending approval (requires accounts:manage)" })
  getPendingRegistrations() {
    return this.authService.getPendingRegistrations();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission("accounts:manage")
  @Put("registrations/:id/review")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Approve or reject a pending staff registration (requires accounts:manage)" })
  reviewRegistration(@Param("id") id: string, @Body() body: { action: "approve" | "reject" }) {
    return this.authService.reviewRegistration(id, body.action);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission("accounts:manage")
  @Get("accounts")
  @ApiBearerAuth()
  @ApiOperation({ summary: "List all staff accounts — login ID, role, status (requires accounts:manage)" })
  getAccounts(@CurrentUser() user: AuthUser) {
    return this.authService.getAllAccounts(user.tenantId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission("accounts:manage")
  @Post("accounts/:id/reset-password")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Reset a staff member's password; returns a temp password if none supplied (requires accounts:manage)" })
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: { newPassword?: string },
  ) {
    return this.authService.resetPassword(user, id, body.newPassword);
  }

  // Changing an account's role is restricted to super_admin and HR only —
  // deliberately NOT the accounts:manage permission (which Admin also holds).
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.SUPER_ADMIN, ROLES.HR)
  @Put("accounts/role")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Change the account role for one or more staff (super admin / HR only)" })
  changeAccountRoles(
    @CurrentUser() user: AuthUser,
    @Body() body: { userIds: string[]; role: string },
  ) {
    return this.authService.changeRoles(user.tenantId, body?.userIds ?? [], body?.role);
  }
}
