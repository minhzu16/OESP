import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuthResponse, ErrorCode, UserDto } from '@exam/shared';
import { getConfig } from '../../config/config';
import { AppException } from '../../common/errors';
import { isUniqueViolation, PrismaService } from '../../prisma/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { getDummyHash, hashPassword, verifyPassword } from './password';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export interface IssuedSession extends AuthResponse {
  refreshToken: string;
  refreshExpiresAt: Date;
}

export function toUserDto(u: User): UserDto {
  return { id: u.id, email: u.email, fullName: u.fullName, role: u.role, isActive: u.isActive };
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<IssuedSession> {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          fullName: dto.fullName.trim(),
          passwordHash: await hashPassword(dto.password),
          role: 'STUDENT', // self-registration can never grant elevated roles
        },
      });
      return this.issue(user, randomUUID());
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppException(ErrorCode.EMAIL_TAKEN, 'Email is already registered', HttpStatus.CONFLICT);
      }
      throw err;
    }
  }

  async login(dto: LoginDto): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const invalid = new AppException(
      ErrorCode.INVALID_CREDENTIALS,
      'Invalid email or password',
      HttpStatus.UNAUTHORIZED,
    );
    if (!user) {
      await verifyPassword(await getDummyHash(), dto.password);
      throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppException(
        ErrorCode.ACCOUNT_LOCKED,
        'Too many failed attempts, try again later',
        HttpStatus.UNAUTHORIZED,
        { lockedUntil: user.lockedUntil.toISOString() },
      );
    }
    const ok = await verifyPassword(user.passwordHash, dto.password);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      throw invalid;
    }
    if (!user.isActive) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Account is disabled', HttpStatus.FORBIDDEN);
    }
    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }
    return this.issue(user, randomUUID());
  }

  /**
   * Refresh-token rotation with reuse detection: each refresh token is single-use.
   * Presenting an already-rotated token revokes the whole family (likely theft).
   */
  async refresh(rawToken: string | undefined): Promise<IssuedSession> {
    const invalid = new AppException(
      ErrorCode.REFRESH_TOKEN_INVALID,
      'Invalid refresh token',
      HttpStatus.UNAUTHORIZED,
    );
    if (!rawToken) throw invalid;
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: true },
    });
    if (!stored) throw invalid;
    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      throw invalid;
    }
    if (stored.expiresAt < new Date() || !stored.user.isActive) throw invalid;

    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      // Lost a race with a concurrent refresh using the same token.
      await this.revokeFamily(stored.familyId);
      throw invalid;
    }
    return this.issue(stored.user, stored.familyId);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return toUserDto(user);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issue(user: User, familyId: string): Promise<IssuedSession> {
    const cfg = getConfig();
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { secret: cfg.jwtAccessSecret, expiresIn: cfg.jwtAccessTtlSeconds },
    );
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + cfg.refreshTtlDays * 86_400_000);
    await this.prisma.refreshToken.create({
      data: { userId: user.id, familyId, tokenHash: sha256(refreshToken), expiresAt: refreshExpiresAt },
    });
    return { accessToken, user: toUserDto(user), refreshToken, refreshExpiresAt };
  }
}
