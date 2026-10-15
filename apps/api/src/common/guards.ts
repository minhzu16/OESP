import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';
import { ErrorCode } from '@exam/shared';
import { AppException } from './errors';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';
import { getConfig } from '../config/config';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new AppException(ErrorCode.UNAUTHORIZED, 'Missing access token', HttpStatus.UNAUTHORIZED);
    try {
      const payload = this.jwt.verify<{ sub: string; role: Role }>(token, {
        secret: getConfig().jwtAccessSecret,
      });
      req.user = { id: payload.sub, role: payload.role };
      return true;
    } catch {
      throw new AppException(ErrorCode.UNAUTHORIZED, 'Invalid or expired access token', HttpStatus.UNAUTHORIZED);
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const user = context.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.role)) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Insufficient role', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
