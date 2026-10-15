import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthResponse, UserDto } from '@exam/shared';
import { getConfig } from '../../config/config';
import { AuthUser, CurrentUser, Public } from '../../common/auth.decorators';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthService, IssuedSession } from './auth.service';

const REFRESH_COOKIE = 'rt';
const COOKIE_PATH = '/api/v1/auth';
const authLimit = { default: { limit: () => getConfig().authThrottleLimitPerMinute, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(authLimit)
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response): Promise<AuthResponse> {
    return this.respond(res, await this.auth.register(dto));
  }

  @Public()
  @Throttle(authLimit)
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<AuthResponse> {
    return this.respond(res, await this.auth.login(dto));
  }

  @Public()
  @Throttle(authLimit)
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResponse> {
    try {
      return this.respond(res, await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
      throw err;
    }
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.auth.me(user.id);
  }

  /** Refresh token lives only in an httpOnly cookie scoped to the auth endpoints. */
  private respond(res: Response, session: IssuedSession): AuthResponse {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: getConfig().isProduction,
      sameSite: 'strict',
      path: COOKIE_PATH,
      expires: session.refreshExpiresAt,
    });
    return { accessToken: session.accessToken, user: session.user };
  }
}
