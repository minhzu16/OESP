import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Attempt, AttemptStatus, Prisma } from '@prisma/client';
import {
  AttemptView,
  ErrorCode,
  SaveAnswerResponse,
  StudentExamDto,
  SubmitResponse,
} from '@exam/shared';
import { getConfig } from '../../config/config';
import { AuthUser } from '../../common/auth.decorators';
import { AppException, conflict, notFound } from '../../common/errors';
import { randomSeed } from '../../common/random';
import { Db, dbNow, isUniqueViolation, PrismaService } from '../../prisma/prisma.service';
import { ExpiryService } from '../core/expiry.service';
import { GradingService } from '../core/grading.service';
import { computeDeadline, examPhase, optionOrder, pickQuestionVersions, resultsReleased } from '../exams/exam-rules';

@Injectable()
export class AttemptsService {
  private readonly logger = new Logger(AttemptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly grading: GradingService,
    private readonly expiry: ExpiryService,
  ) {}

  /**
   * Start (or resume) an attempt. Idempotent: if the student already has an IN_PROGRESS
   * attempt it is returned instead of creating another.
   *
   * Concurrency: a per-(exam, student) advisory lock serialises concurrent starts so the
   * attempt-count check and the insert are atomic; the partial unique index
   * `uq_one_active_attempt` is the last line of defence if anything bypasses the lock.
   */
  async start(examId: string, user: AuthUser, clientSessionId?: string): Promise<{ view: AttemptView; created: boolean }> {
    let outcome: { attemptId: string; created: boolean };
    try {
      outcome = await this.prisma.$transaction((tx) => this.startTx(tx, examId, user, clientSessionId), {
        timeout: 20_000,
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Lost the race to a concurrent start — return the winner's attempt.
      const active = await this.prisma.attempt.findFirst({
        where: { examId, studentId: user.id, status: 'IN_PROGRESS' },
      });
      if (!active) throw err;
      outcome = { attemptId: active.id, created: false };
    }
    return { view: await this.getView(outcome.attemptId, user), created: outcome.created };
  }

  private async startTx(
    tx: Prisma.TransactionClient,
    examId: string,
    user: AuthUser,
    clientSessionId?: string,
  ): Promise<{ attemptId: string; created: boolean }> {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${examId}), hashtext(${user.id}))`;
    const now = await dbNow(tx);

    const exam = await tx.exam.findUnique({
      where: { id: examId },
      include: {
        fixedQuestions: { orderBy: { orderIndex: 'asc' } },
        sections: { orderBy: { orderIndex: 'asc' }, include: { pool: true } },
      },
    });
    if (!exam || exam.status === 'DRAFT' || !(await this.isAssigned(tx, examId, user.id))) {
      throw notFound('Exam');
    }

    const active = await tx.attempt.findFirst({ where: { examId, studentId: user.id, status: 'IN_PROGRESS' } });
    if (active) {
      const expired = await this.expiry.expireIfOverdue(tx, active.id);
      if (!expired) return { attemptId: active.id, created: false };
    }

    const phase = examPhase(exam, now);
    if (phase === 'SCHEDULED') {
      throw conflict(ErrorCode.EXAM_NOT_OPEN, 'Exam has not opened yet', { startAt: exam.startAt });
    }
    if (phase !== 'OPEN') throw conflict(ErrorCode.EXAM_CLOSED, 'Exam is closed', { endAt: exam.endAt });

    const previous = await tx.attempt.findMany({
      where: { examId, studentId: user.id },
      select: { attemptNo: true, status: true },
    });
    const counted = previous.filter((a) => a.status !== 'ABANDONED').length;
    if (counted >= exam.maxAttempts) {
      throw conflict(ErrorCode.NO_ATTEMPTS_LEFT, 'No attempts left', { maxAttempts: exam.maxAttempts });
    }

    const seed = randomSeed();
    const versionIds = pickQuestionVersions({
      seed,
      shuffleQuestions: exam.shuffleQuestions,
      fixed: exam.fixedQuestions.map((f) => f.questionVersionId!).filter(Boolean),
      sections: exam.sections.map((s) => ({
        pickCount: s.pickCount,
        pool: s.pool.map((p) => p.questionVersionId),
      })),
    });
    const versions = await tx.questionVersion.findMany({
      where: { id: { in: versionIds } },
      select: { id: true, type: true, options: { select: { id: true }, orderBy: { orderIndex: 'asc' } } },
    });
    const byId = new Map(versions.map((v) => [v.id, v]));

    const attempt = await tx.attempt.create({
      data: {
        examId,
        studentId: user.id,
        attemptNo: Math.max(0, ...previous.map((a) => a.attemptNo)) + 1,
        startedAt: now,
        deadlineAt: computeDeadline(now, exam.durationSeconds, exam.endAt),
        seed,
        clientSessionId,
        questions: {
          create: versionIds.map((id, position) => {
            const v = byId.get(id)!;
            return {
              position,
              questionVersionId: id,
              optionOrder: optionOrder(
                seed,
                id,
                v.options.map((o) => o.id),
                exam.shuffleOptions && v.type !== 'TRUE_FALSE',
              ),
            };
          }),
        },
      },
    });
    return { attemptId: attempt.id, created: true };
  }

  /** Student view of an attempt: question snapshot without correctness data + saved answers. */
  async getView(attemptId: string, user: AuthUser): Promise<AttemptView> {
    let attempt = await this.loadOwn(attemptId, user);
    if (attempt.status === 'IN_PROGRESS') {
      // Lazy expiry: reading an overdue attempt closes it.
      const expired = await this.prisma.$transaction((tx) => this.expiry.expireIfOverdue(tx, attemptId));
      if (expired) attempt = await this.loadOwn(attemptId, user);
    }

    const [exam, questions, answers, now] = await Promise.all([
      this.prisma.exam.findUniqueOrThrow({ where: { id: attempt.examId }, select: { title: true } }),
      this.prisma.attemptQuestion.findMany({
        where: { attemptId },
        orderBy: { position: 'asc' },
        include: {
          questionVersion: {
            // NOTE: is_correct and explanation are deliberately never selected here.
            select: {
              type: true,
              content: true,
              marks: true,
              options: { select: { id: true, content: true } },
            },
          },
        },
      }),
      this.prisma.attemptAnswer.findMany({ where: { attemptId } }),
      dbNow(this.prisma),
    ]);

    return {
      id: attempt.id,
      examId: attempt.examId,
      examTitle: exam.title,
      attemptNo: attempt.attemptNo,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      deadlineAt: attempt.deadlineAt.toISOString(),
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      submitReason: attempt.submitReason,
      questions: questions.map((q) => {
        const options = new Map(q.questionVersion.options.map((o) => [o.id, o]));
        return {
          position: q.position,
          questionVersionId: q.questionVersionId,
          type: q.questionVersion.type,
          content: q.questionVersion.content,
          marks: Number(q.questionVersion.marks),
          options: q.optionOrder.map((id) => options.get(id)!).filter(Boolean),
        };
      }),
      answers: answers.map((a) => ({
        questionVersionId: a.questionVersionId,
        selectedOptionIds: a.selectedOptionIds,
        seq: a.seq,
        savedAt: a.savedAt.toISOString(),
      })),
      serverTime: now.toISOString(),
    };
  }

  /**
   * Autosave one answer. Holds a FOR SHARE lock on the attempt row so it serialises against
   * submit (which takes a row-exclusive lock): an answer is either saved before the attempt is
   * closed and therefore graded, or rejected — never saved-but-ignored.
   * Out-of-order / retried requests are resolved with `seq` (only a newer seq overwrites).
   */
  async saveAnswer(
    attemptId: string,
    questionVersionId: string,
    selectedOptionIds: string[],
    seq: number,
    user: AuthUser,
  ): Promise<SaveAnswerResponse> {
    const grace = getConfig().submissionGraceSeconds;
    const outcome = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ status: AttemptStatus; within: boolean }[]>`
        SELECT status, (now() <= deadline_at + ${grace}::int * interval '1 second') AS within
          FROM attempts
         WHERE id = ${attemptId}::uuid AND student_id = ${user.id}::uuid
           FOR SHARE`;
      if (rows.length === 0) throw notFound('Attempt');
      const { status, within } = rows[0];
      if (status !== 'IN_PROGRESS') {
        throw conflict(ErrorCode.ATTEMPT_NOT_IN_PROGRESS, 'Attempt is no longer in progress', { status });
      }
      if (!within) {
        await this.expiry.expireIfOverdue(tx, attemptId);
        return { expired: true as const };
      }

      const item = await tx.attemptQuestion.findUnique({
        where: { attemptId_questionVersionId: { attemptId, questionVersionId } },
        include: { questionVersion: { select: { type: true, options: { select: { id: true } } } } },
      });
      if (!item) throw notFound('Question');
      const selected = [...new Set(selectedOptionIds)];
      const valid = new Set(item.questionVersion.options.map((o) => o.id));
      if (selected.some((id) => !valid.has(id))) {
        throw new AppException(ErrorCode.INVALID_ANSWER, 'Unknown option', HttpStatus.BAD_REQUEST);
      }
      if (item.questionVersion.type !== 'MULTIPLE' && selected.length > 1) {
        throw new AppException(ErrorCode.INVALID_ANSWER, 'Only one option may be selected', HttpStatus.BAD_REQUEST);
      }

      const saved = await tx.$queryRaw<{ seq: number; saved_at: Date; now: Date }[]>`
        INSERT INTO attempt_answers (attempt_id, question_version_id, selected_option_ids, seq, saved_at)
        VALUES (${attemptId}::uuid, ${questionVersionId}::uuid, ${selected}::uuid[], ${seq}, now())
        ON CONFLICT (attempt_id, question_version_id) DO UPDATE
           SET selected_option_ids = EXCLUDED.selected_option_ids,
               seq = EXCLUDED.seq,
               saved_at = EXCLUDED.saved_at
         WHERE attempt_answers.seq < EXCLUDED.seq
        RETURNING seq, saved_at, now() AS now`;
      if (saved.length > 0) {
        return { expired: false as const, seq: saved[0].seq, savedAt: saved[0].saved_at, now: saved[0].now };
      }

      const current = await tx.attemptAnswer.findUniqueOrThrow({
        where: { attemptId_questionVersionId: { attemptId, questionVersionId } },
      });
      if (current.seq === seq) {
        // Retry of a request that was already applied — idempotent success.
        return { expired: false as const, seq, savedAt: current.savedAt, now: await dbNow(tx) };
      }
      throw conflict(ErrorCode.STALE_SEQ, 'A newer answer was already saved', { currentSeq: current.seq });
    });

    if (outcome.expired) {
      throw conflict(ErrorCode.ATTEMPT_EXPIRED, 'Time is up; the attempt has been submitted automatically');
    }
    return {
      questionVersionId,
      seq: outcome.seq,
      savedAt: outcome.savedAt.toISOString(),
      serverTime: outcome.now.toISOString(),
    };
  }

  /**
   * Submit. Exactly one concurrent request can flip IN_PROGRESS → SUBMITTED (conditional
   * update); every other request — double click, retry, second tab, sweeper — sees zero rows
   * updated and simply receives the current state. Grading happens in the same transaction.
   */
  async submit(attemptId: string, user: AuthUser): Promise<SubmitResponse> {
    const grace = getConfig().submissionGraceSeconds;
    const alreadySubmitted = await this.prisma.$transaction(async (tx) => {
      const won = await tx.$queryRaw<{ id: string }[]>`
        UPDATE attempts
           SET status = 'SUBMITTED', submitted_at = now(), submit_reason = 'MANUAL', version = version + 1
         WHERE id = ${attemptId}::uuid
           AND student_id = ${user.id}::uuid
           AND status = 'IN_PROGRESS'
           AND now() <= deadline_at + ${grace}::int * interval '1 second'
        RETURNING id`;
      if (won.length > 0) {
        await this.grading.gradeAttempt(tx, attemptId);
        return false;
      }
      const attempt = await tx.attempt.findFirst({ where: { id: attemptId, studentId: user.id } });
      if (!attempt) throw notFound('Attempt');
      if (attempt.status === 'IN_PROGRESS') {
        // Too late for a manual submit: close it as a timeout with what was saved in time.
        await this.expiry.expireIfOverdue(tx, attemptId);
        return false;
      }
      return true;
    });

    const attempt = await this.loadOwn(attemptId, user);
    return {
      attemptId,
      status: attempt.status,
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      submitReason: attempt.submitReason,
      alreadySubmitted,
      serverTime: (await dbNow(this.prisma)).toISOString(),
    };
  }

  /** Exams assigned to the student (directly or through a class). */
  async myExams(user: AuthUser): Promise<StudentExamDto[]> {
    const now = await dbNow(this.prisma);
    const exams = await this.prisma.exam.findMany({
      where: {
        status: { in: ['PUBLISHED', 'ARCHIVED'] },
        assignments: {
          some: { OR: [{ studentId: user.id }, { class: { members: { some: { userId: user.id } } } }] },
        },
      },
      include: {
        sections: { select: { pickCount: true } },
        _count: { select: { fixedQuestions: true } },
        attempts: { where: { studentId: user.id }, select: { id: true, status: true } },
      },
      orderBy: { startAt: 'asc' },
    });
    return exams.map((e) => {
      const used = e.attempts.filter((a) => a.status !== 'ABANDONED').length;
      return {
        id: e.id,
        title: e.title,
        instructions: e.instructions,
        durationSeconds: e.durationSeconds,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt.toISOString(),
        phase: examPhase(e, now),
        maxAttempts: e.maxAttempts,
        attemptsUsed: used,
        attemptsLeft: Math.max(0, e.maxAttempts - used),
        activeAttemptId: e.attempts.find((a) => a.status === 'IN_PROGRESS')?.id ?? null,
        resultsReleased: resultsReleased(e.resultsReleaseAt, now),
        questionCount: e._count.fixedQuestions + e.sections.reduce((s, x) => s + x.pickCount, 0),
      };
    });
  }

  async myAttempts(user: AuthUser) {
    const now = await dbNow(this.prisma);
    const attempts = await this.prisma.attempt.findMany({
      where: { studentId: user.id },
      orderBy: { startedAt: 'desc' },
      include: {
        exam: { select: { id: true, title: true, resultsReleaseAt: true } },
        result: { select: { score: true, maxScore: true, passed: true } },
      },
    });
    return attempts.map((a) => {
      const released = resultsReleased(a.exam.resultsReleaseAt, now);
      return {
        id: a.id,
        examId: a.examId,
        examTitle: a.exam.title,
        attemptNo: a.attemptNo,
        status: a.status,
        startedAt: a.startedAt.toISOString(),
        submittedAt: a.submittedAt?.toISOString() ?? null,
        deadlineAt: a.deadlineAt.toISOString(),
        released,
        score: released && a.result ? Number(a.result.score) : null,
        maxScore: released && a.result ? Number(a.result.maxScore) : null,
        passed: released && a.result ? a.result.passed : null,
      };
    });
  }

  private async loadOwn(attemptId: string, user: AuthUser): Promise<Attempt> {
    // Ownership is part of the query: another student's attempt is indistinguishable from a missing one.
    const attempt = await this.prisma.attempt.findFirst({ where: { id: attemptId, studentId: user.id } });
    if (!attempt) throw notFound('Attempt');
    return attempt;
  }

  private async isAssigned(db: Db, examId: string, studentId: string): Promise<boolean> {
    const hit = await db.examAssignment.findFirst({
      where: { examId, OR: [{ studentId }, { class: { members: { some: { userId: studentId } } } }] },
      select: { id: true },
    });
    return !!hit;
  }
}
