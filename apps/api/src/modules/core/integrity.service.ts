import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { checksumMatches } from './checksum';
import { GradingService } from './grading.service';

export interface ChecksumMismatch {
  attemptId: string;
  examId: string;
  storedScore: number;
}

/** Recomputes result HMACs to detect rows modified outside the application. */
@Injectable()
export class IntegrityService {
  private readonly logger = new Logger(IntegrityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly grading: GradingService,
  ) {}

  async verify(examId?: string): Promise<{ checked: number; mismatches: ChecksumMismatch[] }> {
    const results = await this.prisma.result.findMany({
      where: examId ? { attempt: { examId } } : undefined,
      include: { attempt: { select: { examId: true, answers: true } } },
    });
    const mismatches: ChecksumMismatch[] = [];
    for (const r of results) {
      const expected = this.grading.checksumFor(
        r.attemptId,
        Number(r.score),
        Number(r.maxScore),
        r.attempt.answers,
      );
      if (!checksumMatches(expected, r.checksum)) {
        mismatches.push({ attemptId: r.attemptId, examId: r.attempt.examId, storedScore: Number(r.score) });
      }
    }
    if (mismatches.length > 0) {
      this.logger.warn(`Result checksum mismatch for ${mismatches.length} result(s): possible tampering`);
    }
    return { checked: results.length, mismatches };
  }
}
