import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@exam/shared';

/** Domain error with a stable machine-readable code (see @exam/shared ErrorCode). */
export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export const notFound = (what = 'Resource') =>
  new AppException(ErrorCode.NOT_FOUND, `${what} not found`, HttpStatus.NOT_FOUND);

export const forbidden = (message = 'Forbidden') =>
  new AppException(ErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN);

export const conflict = (code: ErrorCode, message: string, details?: unknown) =>
  new AppException(code, message, HttpStatus.CONFLICT, details);

export const badRequest = (code: ErrorCode, message: string, details?: unknown) =>
  new AppException(code, message, HttpStatus.BAD_REQUEST, details);
