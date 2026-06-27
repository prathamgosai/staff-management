import { Controller, Post, Put, Body, Get, UseGuards, Req, HttpCode, HttpStatus, Param } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ROLES, type AuthUser } from "@workforceiq/shared";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.SUPER_ADMIN)
  @Get("pending-registrations")
  @ApiBearerAuth()
  @ApiOperation({ summary: "List staff accounts pending approval (super admin only)" })
  getPendingRegistrations() {
    return this.authService.getPendingRegistrations();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.SUPER_ADMIN)
  @Put("registrations/:id/review")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Approve or reject a pending staff registration (super admin only)" })
  reviewRegistration(@Param("id") id: string, @Body() body: { action: "approve" | "reject" }) {
    return this.authService.reviewRegistration(id, body.action);
  }
}
