import { Controller, Get, Headers, HttpStatus, Module, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import Redis from 'ioredis';
import { collectDefaultMetrics, Gauge, register } from 'prom-client';
import { getConfig } from '../../config/config';
import { Public } from '../../common/auth.decorators';
import { forbidden } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';

let metricsInitialised = false;

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  private redis: Redis | null = null;

  constructor(private readonly prisma: PrismaService) {
    if (!metricsInitialised) {
      metricsInitialised = true;
      collectDefaultMetrics();
      const prisma = this.prisma;
      new Gauge({
        name: 'exam_attempts_in_progress',
        help: 'Attempts currently IN_PROGRESS',
        async collect() {
          this.set(await prisma.attempt.count({ where: { status: 'IN_PROGRESS' } }));
        },
      });
      new Gauge({
        name: 'exam_attempts_overdue',
        help: 'IN_PROGRESS attempts past their deadline (sweeper lag indicator)',
        async collect() {
          const rows = await prisma.$queryRaw<{ n: bigint }[]>`
            SELECT count(*) AS n FROM attempts WHERE status = 'IN_PROGRESS' AND deadline_at < now()`;
          this.set(Number(rows[0].n));
        },
      });
    }
  }

  @Get('health')
  async health(@Res({ passthrough: true }) res: Response) {
    const checks: Record<string, 'up' | 'down' | 'disabled'> = { database: 'down', redis: 'disabled' };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'up';
    } catch {
      /* reported below */
    }
    const redisUrl = getConfig().redisUrl;
    if (redisUrl) {
      try {
        this.redis ??= new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2000 });
        if (this.redis.status === 'wait') await this.redis.connect();
        await this.redis.ping();
        checks.redis = 'up';
      } catch {
        checks.redis = 'down';
      }
    }
    const ok = !Object.values(checks).includes('down');
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: ok ? 'ok' : 'degraded', checks, time: new Date().toISOString() };
  }

  /** Prometheus scrape endpoint; protected by METRICS_TOKEN when configured. */
  @Get('metrics')
  async metrics(@Headers('authorization') auth: string | undefined, @Res() res: Response) {
    const token = getConfig().metricsToken;
    if (token && auth !== `Bearer ${token}`) throw forbidden();
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
