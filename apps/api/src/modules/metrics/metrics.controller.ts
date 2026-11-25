import { Controller, Get, Headers, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/auth.decorators';
import { forbidden } from '../../common/errors';
import { getConfig } from '../../config/config';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@Public()
@SkipThrottle()
@Controller({ version: VERSION_NEUTRAL })
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /** Prometheus scrape endpoint; protected by METRICS_TOKEN when configured. */
  @Get('metrics')
  async scrape(@Headers('authorization') auth: string | undefined, @Res() res: Response) {
    const token = getConfig().metricsToken;
    if (token && auth !== `Bearer ${token}`) throw forbidden();
    res.setHeader('Content-Type', this.metrics.contentType);
    res.send(await this.metrics.getMetrics());
  }
}
