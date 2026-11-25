import { Injectable, Optional } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  private readonly httpRequestsTotal: Counter<'method' | 'route' | 'status_code'>;
  private readonly httpRequestDurationSeconds: Histogram<'method' | 'route' | 'status_code'>;

  constructor(@Optional() private readonly prisma?: PrismaService) {
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'] as const,
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'] as const,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    if (this.prisma) {
      const prisma = this.prisma;
      new Gauge({
        name: 'exam_attempts_in_progress',
        help: 'Attempts currently IN_PROGRESS',
        registers: [this.registry],
        async collect() {
          this.set(await prisma.attempt.count({ where: { status: 'IN_PROGRESS' } }));
        },
      });
      new Gauge({
        name: 'exam_attempts_overdue',
        help: 'IN_PROGRESS attempts past their deadline (sweeper lag indicator)',
        registers: [this.registry],
        async collect() {
          const rows = await prisma.$queryRaw<{ n: bigint }[]>`
            SELECT count(*) AS n FROM attempts WHERE status = 'IN_PROGRESS' AND deadline_at < now()`;
          this.set(Number(rows[0].n));
        },
      });
    }
  }

  recordHttpRequest(method: string, route: string, statusCode: number, durationSeconds: number): void {
    const labels = {
      method: method.toUpperCase(),
      route,
      status_code: String(statusCode),
    };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDurationSeconds.observe(labels, durationSeconds);
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
