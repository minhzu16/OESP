import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startNs = process.hrtime.bigint();
    res.on('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - startNs) / 1e9;
      const matchedPath = (req as Request & { route?: { path?: string } }).route?.path;
      const route =
        res.statusCode === 404 || !matchedPath
          ? 'unmatched'
          : `${req.baseUrl || ''}${matchedPath}`;
      this.metrics.recordHttpRequest(req.method, route, res.statusCode, durationSeconds);
    });
    next();
  }
}
