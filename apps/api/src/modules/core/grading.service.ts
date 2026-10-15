import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getConfig } from '../../config/config';
import { Db, PrismaService } from '../../prisma/prisma.service';
import { ScorableQuestion, scoreAttempt, ScoreSummary } from '../scoring/scoring';
import { answersHash, resultChecksum } from './checksum';

export interface ComputedResult extends ScoreSummary {
  passed: boolean | null;
  checksum: string;
}

@Injectable()
export class GradingService {
  private readonly logger = new Logger(GradingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Grades a SUBMITTED/EXPIRED attempt exactly once. The conditional status flip is the
   * guard: concurrent callers (submit, sweeper, catch-up job) race on it and only one wins;
   * `results.attempt_id` being the primary key is the second line of defence.
   * Must run inside a transaction so status flip and result insert commit together.
   */
  async gradeAttempt(tx: Prisma.TransactionClient, attemptId: string): Promise<boolean> {
    const won = await tx.$queryRaw<{ id: string }[]>`
      UPDATE attempts
         SET status = 'GRADED', graded_at = now(), version = version + 1
       WHERE id = ${attemptId}::uuid AND status IN ('SUBMITTED', 'EXPIRED')
      RETURNING id`;
    if (won.length === 0) return false;

    const computed = await this.compute(tx, attemptId);
    await tx.result.create({
      data: {
        attemptId,
        score: computed.score,
        maxScore: computed.maxScore,
        correctCount: computed.correctCount,
        wrongCount: computed.wrongCount,
        blankCount: computed.blankCount,
        passed: computed.passed,
        breakdown: computed.breakdown as unknown as Prisma.InputJsonValue,
        checksum: computed.checksum,
      },
    });
    return true;
  }

  /** Recomputes the score of an attempt from its frozen question versions and saved answers. */
  async compute(db: Db, attemptId: string): Promise<ComputedResult> {
    const attempt = await db.attempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: {
        exam: { select: { partialCredit: true, passMark: true } },
        answers: true,
        questions: {
          include: { questionVersion: { include: { options: true } } },
        },
      },
    });

    const questions: ScorableQuestion[] = attempt.questions.map((aq) => ({
      position: aq.position,
      questionVersionId: aq.questionVersionId,
      type: aq.questionVersion.type,
      marks: Number(aq.questionVersion.marks),
      negativeMarks: Number(aq.questionVersion.negativeMarks),
      optionIds: aq.questionVersion.options.map((o) => o.id),
      correctOptionIds: aq.questionVersion.options.filter((o) => o.isCorrect).map((o) => o.id),
    }));
    const answers = new Map(attempt.answers.map((a) => [a.questionVersionId, a.selectedOptionIds]));
    const summary = scoreAttempt(questions, answers, {
      partialCredit: attempt.exam.partialCredit,
      clampTotalAtZero: true,
    });
    const passMark = attempt.exam.passMark === null ? null : Number(attempt.exam.passMark);
    return {
      ...summary,
      passed: passMark === null ? null : summary.score >= passMark,
      checksum: this.checksumFor(attemptId, summary.score, summary.maxScore, attempt.answers),
    };
  }

  checksumFor(
    attemptId: string,
    score: number,
    maxScore: number,
    answers: { questionVersionId: string; selectedOptionIds: string[] }[],
  ): string {
    return resultChecksum(getConfig().resultHmacSecret, attemptId, score, maxScore, answersHash(answers));
  }

  /** Catch-up: grade attempts that were closed but never graded (e.g. crash between steps). */
  async gradePending(limit = 200): Promise<number> {
    const pending = await this.prisma.attempt.findMany({
      where: { status: { in: ['SUBMITTED', 'EXPIRED'] } },
      select: { id: true },
      take: limit,
      orderBy: { submittedAt: 'asc' },
    });
    let graded = 0;
    for (const { id } of pending) {
      try {
        if (await this.prisma.$transaction((tx) => this.gradeAttempt(tx, id))) graded++;
      } catch (err) {
        this.logger.error(`Failed to grade attempt ${id}: ${(err as Error).message}`);
      }
    }
    return graded;
  }
}
