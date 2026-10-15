import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SubmitReason } from '@prisma/client';
import { getConfig } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { GradingService } from './grading.service';

/**
 * Closes attempts whose deadline (+ grace) has passed. Three independent paths call into
 * this so an abandoned browser tab can never keep an attempt open:
 *   1. the client auto-submits at 0,
 *   2. lazy expiry when any request touches an overdue attempt,
 *   3. the periodic sweeper (safe to run on many workers thanks to SKIP LOCKED).
 */
@Injectable()
export class ExpiryService {
  private readonly logger = new Logger(ExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly grading: GradingService,
  ) {}

  /** Expire + grade a single attempt if it is overdue. Returns true when this call expired it. */
  async expireIfOverdue(
    tx: Prisma.TransactionClient,
    attemptId: string,
    reason: SubmitReason = 'TIMEOUT',
  ): Promise<boolean> {
    const grace = getConfig().submissionGraceSeconds;
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE attempts
         SET status = 'EXPIRED', submit_reason = ${reason}::"SubmitReason",
             submitted_at = deadline_at, version = version + 1
       WHERE id = ${attemptId}::uuid
         AND status = 'IN_PROGRESS'
         AND deadline_at + ${grace}::int * interval '1 second' < now()
      RETURNING id`;
    if (rows.length === 0) return false;
    await this.grading.gradeAttempt(tx, attemptId);
    return true;
  }

  /** One sweeper pass. Returns the number of attempts expired. */
  async sweep(batchSize = 500): Promise<number> {
    const grace = getConfig().submissionGraceSeconds;
    const expired = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH due AS (
        SELECT id FROM attempts
         WHERE status = 'IN_PROGRESS'
           AND deadline_at + ${grace}::int * interval '1 second' < now()
         ORDER BY deadline_at
         LIMIT ${batchSize}
         FOR UPDATE SKIP LOCKED
      )
      UPDATE attempts a
         SET status = 'EXPIRED', submit_reason = 'SWEEPER',
             submitted_at = a.deadline_at, version = a.version + 1
        FROM due
       WHERE a.id = due.id
      RETURNING a.id`;

    for (const { id } of expired) {
      try {
        await this.prisma.$transaction((tx) => this.grading.gradeAttempt(tx, id));
      } catch (err) {
        // Left in EXPIRED; the catch-up grader retries it.
        this.logger.error(`Grading after expiry failed for ${id}: ${(err as Error).message}`);
      }
    }
    if (expired.length > 0) this.logger.log(`Sweeper expired ${expired.length} attempt(s)`);
    return expired.length;
  }
}
