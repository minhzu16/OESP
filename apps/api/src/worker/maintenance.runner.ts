import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { getConfig } from '../config/config';
import { PrismaService } from '../prisma/prisma.service';
import { ExpiryService } from '../modules/core/expiry.service';
import { GradingService } from '../modules/core/grading.service';
import { IntegrityService } from '../modules/core/integrity.service';

const QUEUE = 'maintenance';

type JobName = 'sweep-expired' | 'grade-pending' | 'verify-results' | 'purge-idempotency';

/**
 * Background jobs. With Redis, BullMQ job schedulers guarantee each tick runs on one worker
 * even with many replicas. Without Redis it falls back to in-process timers — still correct,
 * because every job is idempotent and uses SKIP LOCKED / conditional updates.
 */
@Injectable()
export class MaintenanceRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MaintenanceRunner.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly expiry: ExpiryService,
    private readonly grading: GradingService,
    private readonly integrity: IntegrityService,
  ) {}

  private schedule(): { name: JobName; everyMs: number }[] {
    return [
      { name: 'sweep-expired', everyMs: getConfig().expirySweepIntervalSeconds * 1000 },
      { name: 'grade-pending', everyMs: 60_000 },
      { name: 'verify-results', everyMs: 3_600_000 },
      { name: 'purge-idempotency', everyMs: 3_600_000 },
    ];
  }

  async onApplicationBootstrap(): Promise<void> {
    const redisUrl = getConfig().redisUrl;
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not set — using in-process timers for maintenance jobs');
      for (const s of this.schedule()) {
        this.timers.push(setInterval(() => void this.runSafe(s.name), s.everyMs));
      }
      return;
    }
    const connection = { url: redisUrl, maxRetriesPerRequest: null };
    this.queue = new Queue(QUEUE, { connection });
    for (const s of this.schedule()) {
      await this.queue.upsertJobScheduler(
        s.name,
        { every: s.everyMs },
        { name: s.name, opts: { removeOnComplete: 100, removeOnFail: 500 } },
      );
    }
    this.worker = new Worker(QUEUE, (job) => this.run(job.name as JobName), { connection, concurrency: 1 });
    this.worker.on('failed', (job, err) => this.logger.error(`Job ${job?.name} failed: ${err.message}`));
    this.logger.log(`Maintenance jobs scheduled on BullMQ queue "${QUEUE}"`);
  }

  async onApplicationShutdown(): Promise<void> {
    this.timers.forEach(clearInterval);
    await this.worker?.close();
    await this.queue?.close();
  }

  private async runSafe(name: JobName): Promise<void> {
    try {
      await this.run(name);
    } catch (err) {
      this.logger.error(`Job ${name} failed: ${(err as Error).message}`);
    }
  }

  async run(name: JobName): Promise<unknown> {
    switch (name) {
      case 'sweep-expired':
        return { expired: await this.expiry.sweep() };
      case 'grade-pending':
        return { graded: await this.grading.gradePending() };
      case 'verify-results': {
        const r = await this.integrity.verify();
        return { checked: r.checked, mismatches: r.mismatches.length };
      }
      case 'purge-idempotency': {
        const { count } = await this.prisma.idempotencyKey.deleteMany({
          where: { createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
        });
        return { purged: count };
      }
    }
  }
}
