import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { register as globalRegister } from 'prom-client';
import { resetConfig } from '../../config/config';
import { MetricsController } from './metrics.controller';
import { MetricsMiddleware } from './metrics.middleware';
import { MetricsService } from './metrics.service';

function setBaseEnv(metricsToken?: string) {
  process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
  process.env.RESULT_HMAC_SECRET = 'c'.repeat(32);
  if (metricsToken !== undefined) process.env.METRICS_TOKEN = metricsToken;
  else delete process.env.METRICS_TOKEN;
  resetConfig();
}

describe('MetricsService, MetricsMiddleware, and MetricsController', () => {
  afterEach(() => {
    delete process.env.METRICS_TOKEN;
    resetConfig();
  });

  it('uses an isolated Registry and records http_requests_total and http_request_duration_seconds', async () => {
    const metrics = new MetricsService();
    expect(metrics.registry).not.toBe(globalRegister);

    metrics.recordHttpRequest('get', '/api/v1/exams', 200, 0.042);
    const output = await metrics.getMetrics();
    expect(output).toContain('http_requests_total{method="GET",route="/api/v1/exams",status_code="200"} 1');
    expect(output).toContain('http_request_duration_seconds_count{method="GET",route="/api/v1/exams",status_code="200"} 1');
  });

  it('tags 404 or unmatched routes with route="unmatched" in MetricsMiddleware', async () => {
    const metrics = new MetricsService();
    const middleware = new MetricsMiddleware(metrics);

    const res = new EventEmitter() as unknown as Response & { statusCode: number };
    res.statusCode = 404;
    const req = { method: 'GET', baseUrl: '', originalUrl: '/api/nonexistent' } as unknown as Request;

    const next = jest.fn();
    middleware.use(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    res.emit('finish');

    const output = await metrics.getMetrics();
    expect(output).toContain('http_requests_total{method="GET",route="unmatched",status_code="404"} 1');
  });

  it('serves /metrics when METRICS_TOKEN is unset and enforces Bearer auth when set', async () => {
    const metrics = new MetricsService();
    const controller = new MetricsController(metrics);

    const makeRes = () => ({
      headers: {} as Record<string, string>,
      body: '',
      setHeader(k: string, v: string) {
        this.headers[k] = v;
      },
      send(b: string) {
        this.body = b;
        return this;
      },
    });

    setBaseEnv();
    const res1 = makeRes();
    await controller.scrape(undefined, res1 as unknown as Response);
    expect(res1.headers['Content-Type']).toContain('text/plain');
    expect(res1.body).toContain('http_requests_total');

    setBaseEnv('secret-scrape-token');
    const res2 = makeRes();
    await expect(controller.scrape(undefined, res2 as unknown as Response)).rejects.toThrow('Forbidden');
    await expect(controller.scrape('Bearer wrong', res2 as unknown as Response)).rejects.toThrow('Forbidden');

    await controller.scrape('Bearer secret-scrape-token', res2 as unknown as Response);
    expect(res2.body).toContain('http_requests_total');
  });
});
