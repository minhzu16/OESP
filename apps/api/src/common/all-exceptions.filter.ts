import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ApiErrorBody, ErrorCode } from '@exam/shared';
import { AppException } from './errors';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
};

/** Normalises every error into `{ error: { code, message, details }, requestId }`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const { status, body } = this.toBody(exception);
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    body.requestId = typeof req.id === 'string' ? req.id : undefined;
    res.status(status).json(body);
  }

  private toBody(exception: unknown): { status: number; body: ApiErrorBody } {
    if (exception instanceof AppException) {
      const status = exception.getStatus();
      return {
        status,
        body: { error: { code: exception.code, message: exception.message, details: exception.details } },
      };
    }
    if (exception instanceof ThrottlerException) {
      return {
        status: 429,
        body: { error: { code: ErrorCode.RATE_LIMITED, message: 'Too many requests' } },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse() as string | { message?: string | string[] };
      const raw = typeof response === 'string' ? response : response.message;
      const message = Array.isArray(raw) ? 'Validation failed' : (raw ?? exception.message);
      const details = Array.isArray(raw) ? raw : undefined;
      return {
        status,
        body: { error: { code: STATUS_TO_CODE[status] ?? ErrorCode.INTERNAL, message, details } },
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return { status: 409, body: { error: { code: ErrorCode.CONFLICT, message: 'Duplicate record' } } };
      }
      if (exception.code === 'P2025') {
        return { status: 404, body: { error: { code: ErrorCode.NOT_FOUND, message: 'Record not found' } } };
      }
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { error: { code: ErrorCode.INTERNAL, message: 'Internal server error' } },
    };
  }
}
