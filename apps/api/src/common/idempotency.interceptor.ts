import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { from, mergeMap, Observable, of } from 'rxjs';
import { ErrorCode } from '@exam/shared';
import { PrismaService, isUniqueViolation } from '../prisma/prisma.service';
import { AppException } from './errors';

/**
 * `Idempotency-Key` support: the first response for (user, key) is stored and replayed
 * verbatim for retries. Business-level idempotency (conditional updates) still protects
 * requests that race before the first response is stored.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { id: string } }>();
    const res = http.getResponse<Response>();
    const key = req.header('idempotency-key');
    if (!key || !req.user) return next.handle();
    if (key.length > 200) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Idempotency-Key too long', HttpStatus.BAD_REQUEST);
    }

    const userId = req.user.id;
    const endpoint = `${req.method} ${req.originalUrl.split('?')[0]}`;
    const status =
      this.reflector.get<number>(HTTP_CODE_METADATA, context.getHandler()) ??
      (req.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK);

    return from(this.prisma.idempotencyKey.findUnique({ where: { userId_key: { userId, key } } })).pipe(
      mergeMap((existing) => {
        if (existing) {
          if (existing.endpoint !== endpoint) {
            throw new AppException(
              ErrorCode.IDEMPOTENCY_KEY_REUSED,
              'Idempotency-Key was already used for a different request',
              HttpStatus.UNPROCESSABLE_ENTITY,
            );
          }
          res.status(existing.responseCode);
          res.setHeader('Idempotent-Replayed', 'true');
          return of(existing.responseBody);
        }
        return next.handle().pipe(
          mergeMap(async (body) => {
            try {
              await this.prisma.idempotencyKey.create({
                data: { userId, key, endpoint, responseCode: status, responseBody: body as object },
              });
            } catch (err) {
              if (!isUniqueViolation(err)) throw err;
            }
            return body;
          }),
        );
      }),
    );
  }
}
