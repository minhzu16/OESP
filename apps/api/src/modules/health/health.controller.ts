import { Controller, Get, HttpStatus, Module, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import Redis from 'ioredis';
import { getConfig } from '../../config/config';
import { Public } from '../../common/auth.decorators';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  private redis: Redis | null = null;

  constructor(private readonly prisma: PrismaService) {}

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
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
