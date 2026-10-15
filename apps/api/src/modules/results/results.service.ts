import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AttemptResultDto, ErrorCode, ResultBreakdownItem, ResultReviewItem } from '@exam/shared';
import { AuthUser } from '../../common/auth.decorators';
import { AppException, conflict, notFound } from '../../common/errors';
import { assertOwnerOrAdmin, ownerScope } from '../../common/ownership';
import { pageArgs } from '../../common/pagination';
import { Db, dbNow, PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../core/audit.service';
import { checksumMatches } from '../core/checksum';
import { GradingService } from '../core/grading.service';
import { IntegrityService } from '../core/integrity.service';
import { resultsReleased } from '../exams/exam-rules';
import { AuditQuery, ExtendDeadlineDto, RegradeDto } from './results.dto';

@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly grading: GradingService,
    private readonly audit: AuditService,
    private readonly integrity: IntegrityService,
  ) {}

  /** Student view: score and answer review only once results are released. */
  async studentResult(attemptId: string, user: AuthUser): Promise<AttemptResultDto> {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, studentId: user.id },
      include: { exam: true, result: true },
    });
    if (!attempt) throw notFound('Attempt');
    const now = await dbNow(this.prisma);
    const released = resultsReleased(attempt.exam.resultsReleaseAt, now);
    const base: AttemptResultDto = {
      attemptId,
      examId: attempt.examId,
      examTitle: attempt.exam.title,
      status: attempt.status,
      released: released && !!attempt.result,
      resultsReleaseAt: attempt.exam.resultsReleaseAt?.toISOString() ?? null,
    };
    if (!released || !attempt.result) return base;
    const r = attempt.result;
    return {
      ...base,
      score: Number(r.score),
      maxScore: Number(r.maxScore),
      percentage: Number(r.maxScore) > 0 ? Math.round((Number(r.score) / Number(r.maxScore)) * 10000) / 100 : 0,
      passed: r.passed,
      correctCount: r.correctCount,
      wrongCount: r.wrongCount,
      blankCount: r.blankCount,
      gradedAt: r.gradedAt.toISOString(),
      review: await this.buildReview(this.prisma, attemptId, r.breakdown as unknown as ResultBreakdownItem[]),
    };
  }

  /** Teacher view of a single attempt, including audit trail and integrity status. */
  async teacherAttempt(attemptId: string, user: AuthUser) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: true,
        result: true,
        answers: true,
        student: { select: { id: true, email: true, fullName: true } },
      },
    });
    if (!attempt) throw notFound('Attempt');
    assertOwnerOrAdmin(attempt.exam.ownerId, user, 'Attempt');
    const r = attempt.result;
    const audit = await this.prisma.auditLog.findMany({
      where: { entityId: attemptId, entityType: { in: ['result', 'attempt'] } },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { email: true, fullName: true } } },
    });
    return {
      id: attempt.id,
      examId: attempt.examId,
      examTitle: attempt.exam.title,
      student: attempt.student,
      attemptNo: attempt.attemptNo,
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      submittedAt: attempt.submittedAt,
      submitReason: attempt.submitReason,
      result: r
        ? {
            score: Number(r.score),
            maxScore: Number(r.maxScore),
            passed: r.passed,
            correctCount: r.correctCount,
            wrongCount: r.wrongCount,
            blankCount: r.blankCount,
            gradedAt: r.gradedAt,
            version: r.version,
            integrityOk: checksumMatches(
              this.grading.checksumFor(attemptId, Number(r.score), Number(r.maxScore), attempt.answers),
              r.checksum,
            ),
          }
        : null,
      review: r ? await this.buildReview(this.prisma, attemptId, r.breakdown as unknown as ResultBreakdownItem[]) : [],
      audit: audit.map((a) => ({ ...a, id: a.id.toString() })),
    };
  }

  /**
   * The only way to change a stored result. Runs in one transaction that:
   *  - sets `app.audit_reason` (the DB trigger rejects UPDATEs on `results` without it),
   *  - updates with optimistic locking on `results.version`,
   *  - appends an audit log entry with old/new values.
   */
  async regrade(attemptId: string, dto: RegradeDto, user: AuthUser) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { exam: true, result: true, answers: true },
    });
    if (!attempt) throw notFound('Attempt');
    assertOwnerOrAdmin(attempt.exam.ownerId, user, 'Attempt');
    if (!attempt.result) {
      throw conflict(ErrorCode.CONFLICT, 'Attempt has not been graded yet');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.audit_reason', ${dto.reason}, true)`;
      const old = attempt.result!;
      let data: Prisma.ResultUpdateManyMutationInput;
      let newValue: Record<string, unknown>;

      if (dto.mode === 'RECOMPUTE') {
        const c = await this.grading.compute(tx, attemptId);
        data = {
          score: c.score,
          maxScore: c.maxScore,
          correctCount: c.correctCount,
          wrongCount: c.wrongCount,
          blankCount: c.blankCount,
          passed: c.passed,
          breakdown: c.breakdown as unknown as Prisma.InputJsonValue,
          checksum: c.checksum,
        };
        newValue = { score: c.score, maxScore: c.maxScore, passed: c.passed };
      } else {
        const maxScore = Number(old.maxScore);
        const score = dto.score!;
        if (score > maxScore) {
          throw new AppException(
            ErrorCode.VALIDATION_FAILED,
            `Score cannot exceed ${maxScore}`,
            HttpStatus.BAD_REQUEST,
          );
        }
        const passMark = attempt.exam.passMark === null ? null : Number(attempt.exam.passMark);
        const passed = passMark === null ? null : score >= passMark;
        data = {
          score,
          passed,
          checksum: this.grading.checksumFor(attemptId, score, maxScore, attempt.answers),
        };
        newValue = { score, passed, override: true };
      }

      const { count } = await tx.result.updateMany({
        where: { attemptId, version: dto.expectedVersion },
        data: { ...data, gradedAt: new Date(), version: { increment: 1 } },
      });
      if (count === 0) {
        throw conflict(ErrorCode.VERSION_CONFLICT, 'Result was changed by someone else; reload and retry', {
          currentVersion: old.version,
        });
      }
      await this.audit.log(
        {
          entityType: 'result',
          entityId: attemptId,
          actorId: user.id,
          action: dto.mode === 'RECOMPUTE' ? 'RESULT_RECOMPUTED' : 'RESULT_OVERRIDDEN',
          oldValue: { score: Number(old.score), maxScore: Number(old.maxScore), passed: old.passed, version: old.version },
          newValue,
          reason: dto.reason,
        },
        tx,
      );
    });
    return this.teacherAttempt(attemptId, user);
  }

  /** Give extra time to an in-progress attempt (e.g. after an outage), with audit trail. */
  async extendDeadline(attemptId: string, dto: ExtendDeadlineDto, user: AuthUser) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId }, include: { exam: true } });
    if (!attempt) throw notFound('Attempt');
    assertOwnerOrAdmin(attempt.exam.ownerId, user, 'Attempt');
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ deadline_at: Date }[]>`
        UPDATE attempts
           SET deadline_at = deadline_at + ${dto.extraSeconds}::int * interval '1 second', version = version + 1
         WHERE id = ${attemptId}::uuid AND status = 'IN_PROGRESS'
        RETURNING deadline_at`;
      if (rows.length === 0) {
        throw conflict(ErrorCode.ATTEMPT_NOT_IN_PROGRESS, 'Only in-progress attempts can be extended');
      }
      await this.audit.log(
        {
          entityType: 'attempt',
          entityId: attemptId,
          actorId: user.id,
          action: 'DEADLINE_EXTENDED',
          oldValue: { deadlineAt: attempt.deadlineAt },
          newValue: { deadlineAt: rows[0].deadline_at, extraSeconds: dto.extraSeconds },
          reason: dto.reason,
        },
        tx,
      );
    });
    return this.teacherAttempt(attemptId, user);
  }

  async verifyIntegrity(examId: string | undefined, user: AuthUser) {
    if (user.role !== 'ADMIN') {
      if (!examId) throw new AppException(ErrorCode.VALIDATION_FAILED, 'examId is required', HttpStatus.BAD_REQUEST);
      const exam = await this.prisma.exam.findFirst({ where: { id: examId, ...ownerScope(user) } });
      if (!exam) throw notFound('Exam');
    }
    return this.integrity.verify(examId);
  }

  async auditLogs(q: AuditQuery) {
    const where: Prisma.AuditLogWhereInput = {
      entityType: q.entityType,
      entityId: q.entityId,
      action: q.action,
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { email: true, fullName: true } } },
        ...pageArgs(q),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: items.map((a) => ({ ...a, id: a.id.toString() })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  private async buildReview(db: Db, attemptId: string, breakdown: ResultBreakdownItem[]): Promise<ResultReviewItem[]> {
    const [questions, answers] = await Promise.all([
      db.attemptQuestion.findMany({
        where: { attemptId },
        orderBy: { position: 'asc' },
        include: { questionVersion: { include: { options: true } } },
      }),
      db.attemptAnswer.findMany({ where: { attemptId } }),
    ]);
    const answerMap = new Map(answers.map((a) => [a.questionVersionId, a.selectedOptionIds]));
    const scoreMap = new Map(breakdown.map((b) => [b.questionVersionId, b]));
    return questions.map((q) => {
      const options = new Map(q.questionVersion.options.map((o) => [o.id, o]));
      const b = scoreMap.get(q.questionVersionId);
      return {
        position: q.position,
        questionVersionId: q.questionVersionId,
        type: q.questionVersion.type,
        content: q.questionVersion.content,
        explanation: q.questionVersion.explanation,
        options: q.optionOrder
          .map((id) => options.get(id))
          .filter((o): o is NonNullable<typeof o> => !!o)
          .map((o) => ({ id: o.id, content: o.content, isCorrect: o.isCorrect })),
        selectedOptionIds: answerMap.get(q.questionVersionId) ?? [],
        outcome: b?.outcome ?? 'BLANK',
        awarded: b?.awarded ?? 0,
        marks: b?.marks ?? Number(q.questionVersion.marks),
      };
    });
  }
}
