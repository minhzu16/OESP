import { HttpStatus, Injectable } from '@nestjs/common';
import { Exam, Prisma } from '@prisma/client';
import { ErrorCode, ExamDto } from '@exam/shared';
import { AuthUser } from '../../common/auth.decorators';
import { AppException, conflict, notFound } from '../../common/errors';
import { assertOwnerOrAdmin, ownerScope } from '../../common/ownership';
import { dbNow, PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../core/audit.service';
import { AssignDto, CreateExamDto, SectionDto, UpdateExamDto } from './exams.dto';
import { examPhase } from './exam-rules';

/** Fields that stay editable after publishing (scheduling / wording, never content). */
const POST_PUBLISH_EDITABLE = new Set([
  'version',
  'title',
  'instructions',
  'startAt',
  'endAt',
  'resultsReleaseAt',
  'maxAttempts',
]);

type ExamWithCounts = Exam & {
  sections: { pickCount: number }[];
  _count: { fixedQuestions: number };
};

const countsInclude = {
  sections: { select: { pickCount: true } },
  _count: { select: { fixedQuestions: true } },
} satisfies Prisma.ExamInclude;

export function toExamDto(exam: ExamWithCounts, now: Date): ExamDto {
  return {
    id: exam.id,
    title: exam.title,
    instructions: exam.instructions,
    subjectId: exam.subjectId,
    durationSeconds: exam.durationSeconds,
    startAt: exam.startAt.toISOString(),
    endAt: exam.endAt.toISOString(),
    resultsReleaseAt: exam.resultsReleaseAt?.toISOString() ?? null,
    maxAttempts: exam.maxAttempts,
    gradingMethod: exam.gradingMethod,
    shuffleQuestions: exam.shuffleQuestions,
    shuffleOptions: exam.shuffleOptions,
    partialCredit: exam.partialCredit,
    passMark: exam.passMark === null ? null : Number(exam.passMark),
    status: exam.status,
    phase: examPhase(exam, now),
    publishedAt: exam.publishedAt?.toISOString() ?? null,
    version: exam.version,
    questionCount: exam._count.fixedQuestions + exam.sections.reduce((s, x) => s + x.pickCount, 0),
  };
}

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser): Promise<ExamDto[]> {
    const [exams, now] = await Promise.all([
      this.prisma.exam.findMany({
        where: ownerScope(user),
        include: countsInclude,
        orderBy: { startAt: 'desc' },
      }),
      dbNow(this.prisma),
    ]);
    return exams.map((e) => toExamDto(e, now));
  }

  async get(id: string, user: AuthUser) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        ...countsInclude,
        subject: true,
        sections: {
          orderBy: { orderIndex: 'asc' },
          include: { bank: { select: { id: true, name: true } }, _count: { select: { pool: true } } },
        },
        fixedQuestions: {
          orderBy: { orderIndex: 'asc' },
          include: {
            question: {
              include: { currentVersion: { select: { content: true, marks: true, type: true } } },
            },
          },
        },
        _count: { select: { fixedQuestions: true, assignments: true, attempts: true } },
      },
    });
    if (!exam) throw notFound('Exam');
    assertOwnerOrAdmin(exam.ownerId, user, 'Exam');
    const now = await dbNow(this.prisma);
    return {
      ...toExamDto(exam, now),
      subject: exam.subject,
      assignmentCount: exam._count.assignments,
      attemptCount: exam._count.attempts,
      sections: exam.sections.map((s) => ({
        id: s.id,
        bankId: s.bankId,
        bankName: s.bank.name,
        difficulty: s.difficulty,
        tag: s.tag,
        pickCount: s.pickCount,
        frozenPoolSize: exam.status === 'DRAFT' ? null : s._count.pool,
      })),
      fixedQuestions: exam.fixedQuestions.map((f) => ({
        questionId: f.questionId,
        orderIndex: f.orderIndex,
        frozenVersionId: f.questionVersionId,
        type: f.question.currentVersion?.type ?? f.question.type,
        content: f.question.currentVersion?.content ?? '',
        marks: Number(f.question.currentVersion?.marks ?? 0),
        isDeleted: f.question.isDeleted,
      })),
      serverTime: now.toISOString(),
    };
  }

  async create(dto: CreateExamDto, user: AuthUser): Promise<ExamDto> {
    this.assertWindow(new Date(dto.startAt), new Date(dto.endAt));
    const exam = await this.prisma.exam.create({
      data: {
        ownerId: user.id,
        title: dto.title.trim(),
        instructions: dto.instructions,
        subjectId: dto.subjectId,
        durationSeconds: dto.durationSeconds,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        resultsReleaseAt: dto.resultsReleaseAt ? new Date(dto.resultsReleaseAt) : null,
        maxAttempts: dto.maxAttempts,
        gradingMethod: dto.gradingMethod,
        shuffleQuestions: dto.shuffleQuestions,
        shuffleOptions: dto.shuffleOptions,
        partialCredit: dto.partialCredit,
        passMark: dto.passMark ?? null,
      },
      include: countsInclude,
    });
    return toExamDto(exam, await dbNow(this.prisma));
  }

  async update(id: string, dto: UpdateExamDto, user: AuthUser): Promise<ExamDto> {
    const exam = await this.loadOwned(id, user);
    if (exam.status === 'ARCHIVED') throw this.notEditable('Archived exams cannot be edited');
    if (exam.status === 'PUBLISHED') {
      const locked = Object.entries(dto)
        .filter(([k, v]) => v !== undefined && !POST_PUBLISH_EDITABLE.has(k))
        .map(([k]) => k);
      if (locked.length) {
        throw this.notEditable(`Published exam content is frozen; cannot change: ${locked.join(', ')}`);
      }
    }
    const startAt = dto.startAt ? new Date(dto.startAt) : exam.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : exam.endAt;
    this.assertWindow(startAt, endAt);

    const { version, ...fields } = dto;
    const data: Prisma.ExamUpdateManyMutationInput = {
      ...fields,
      title: fields.title?.trim(),
      startAt,
      endAt,
      resultsReleaseAt:
        fields.resultsReleaseAt === undefined
          ? undefined
          : fields.resultsReleaseAt === null
            ? null
            : new Date(fields.resultsReleaseAt),
      version: { increment: 1 },
    };
    delete (data as Record<string, unknown>).subjectId;

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.exam.updateMany({
        where: { id, version: version ?? exam.version, status: exam.status },
        data,
      });
      if (count === 0) {
        throw conflict(ErrorCode.VERSION_CONFLICT, 'Exam was modified by someone else; reload and retry');
      }
      if (fields.subjectId !== undefined) {
        await tx.exam.update({ where: { id }, data: { subjectId: fields.subjectId } });
      }
      if (exam.status === 'PUBLISHED') {
        await this.audit.log(
          {
            entityType: 'exam',
            entityId: id,
            actorId: user.id,
            action: 'EXAM_SCHEDULE_UPDATED',
            oldValue: {
              startAt: exam.startAt,
              endAt: exam.endAt,
              resultsReleaseAt: exam.resultsReleaseAt,
              maxAttempts: exam.maxAttempts,
            },
            newValue: fields,
          },
          tx,
        );
      }
    });
    return this.dto(id);
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const exam = await this.loadOwned(id, user);
    if (exam.status !== 'DRAFT') throw this.notEditable('Only draft exams can be deleted; archive it instead');
    await this.prisma.exam.delete({ where: { id } });
  }

  async setSections(id: string, sections: SectionDto[], user: AuthUser) {
    await this.loadDraft(id, user);
    const bankIds = [...new Set(sections.map((s) => s.bankId))];
    const banks = await this.prisma.questionBank.findMany({ where: { id: { in: bankIds }, ...ownerScope(user) } });
    if (banks.length !== bankIds.length) throw notFound('Question bank');
    await this.prisma.$transaction([
      this.prisma.examSection.deleteMany({ where: { examId: id } }),
      this.prisma.examSection.createMany({
        data: sections.map((s, i) => ({
          examId: id,
          bankId: s.bankId,
          difficulty: s.difficulty ?? null,
          tag: s.tag ? s.tag.trim().toLowerCase() : null,
          pickCount: s.pickCount,
          orderIndex: i,
        })),
      }),
      this.prisma.exam.update({ where: { id }, data: { version: { increment: 1 } } }),
    ]);
    return this.get(id, user);
  }

  async setFixedQuestions(id: string, questionIds: string[], user: AuthUser) {
    await this.loadDraft(id, user);
    const unique = [...new Set(questionIds)];
    const questions = await this.prisma.question.findMany({
      where: { id: { in: unique }, isDeleted: false, bank: ownerScope(user) },
      select: { id: true },
    });
    if (questions.length !== unique.length) throw notFound('Question');
    await this.prisma.$transaction([
      this.prisma.examFixedQuestion.deleteMany({ where: { examId: id } }),
      this.prisma.examFixedQuestion.createMany({
        data: unique.map((questionId, i) => ({ examId: id, questionId, orderIndex: i })),
      }),
      this.prisma.exam.update({ where: { id }, data: { version: { increment: 1 } } }),
    ]);
    return this.get(id, user);
  }

  /**
   * Publishing freezes content: fixed questions are pinned to their current version and every
   * random-draw section gets a snapshot pool of question versions. Pools are made disjoint
   * (first matching section wins, fixed questions excluded) so every draw is always feasible.
   */
  async publish(id: string, user: AuthUser): Promise<ExamDto> {
    await this.prisma.$transaction(
      async (tx) => {
        const exam = await tx.exam.findUnique({
          where: { id },
          include: {
            sections: { orderBy: { orderIndex: 'asc' } },
            fixedQuestions: { orderBy: { orderIndex: 'asc' }, include: { question: true } },
          },
        });
        if (!exam) throw notFound('Exam');
        assertOwnerOrAdmin(exam.ownerId, user, 'Exam');
        if (exam.status !== 'DRAFT') throw this.notEditable('Exam is already published');
        this.assertWindow(exam.startAt, exam.endAt);

        const problems: string[] = [];
        const used = new Set<string>();
        for (const f of exam.fixedQuestions) {
          if (f.question.isDeleted || !f.question.currentVersionId) {
            problems.push(`Fixed question ${f.questionId} was deleted`);
            continue;
          }
          used.add(f.question.currentVersionId);
          await tx.examFixedQuestion.update({
            where: { examId_questionId: { examId: id, questionId: f.questionId } },
            data: { questionVersionId: f.question.currentVersionId },
          });
        }

        for (const [i, s] of exam.sections.entries()) {
          const candidates = await tx.question.findMany({
            where: {
              bankId: s.bankId,
              isDeleted: false,
              currentVersionId: { not: null },
              difficulty: s.difficulty ?? undefined,
              tags: s.tag ? { has: s.tag } : undefined,
            },
            select: { currentVersionId: true },
          });
          const pool = candidates.map((c) => c.currentVersionId!).filter((v) => !used.has(v));
          if (pool.length < s.pickCount) {
            problems.push(`Section ${i + 1} needs ${s.pickCount} questions but only ${pool.length} are available`);
            continue;
          }
          pool.forEach((v) => used.add(v));
          await tx.examPoolItem.createMany({
            data: pool.map((questionVersionId) => ({ sectionId: s.id, questionVersionId })),
          });
        }

        const total = exam.fixedQuestions.length + exam.sections.reduce((n, s) => n + s.pickCount, 0);
        if (total === 0) problems.push('Exam has no questions');
        if (problems.length) {
          throw new AppException(ErrorCode.EXAM_INVALID, 'Exam cannot be published', HttpStatus.BAD_REQUEST, problems);
        }

        const { count } = await tx.exam.updateMany({
          where: { id, status: 'DRAFT' },
          data: { status: 'PUBLISHED', publishedAt: new Date(), version: { increment: 1 } },
        });
        if (count === 0) throw this.notEditable('Exam is already published');
        await this.audit.log(
          { entityType: 'exam', entityId: id, actorId: user.id, action: 'EXAM_PUBLISHED', newValue: { total } },
          tx,
        );
      },
      { timeout: 30_000 },
    );
    return this.dto(id);
  }

  async archive(id: string, user: AuthUser): Promise<ExamDto> {
    const exam = await this.loadOwned(id, user);
    if (exam.status !== 'PUBLISHED') throw this.notEditable('Only published exams can be archived');
    await this.prisma.exam.update({ where: { id }, data: { status: 'ARCHIVED', version: { increment: 1 } } });
    await this.audit.log({ entityType: 'exam', entityId: id, actorId: user.id, action: 'EXAM_ARCHIVED' });
    return this.dto(id);
  }

  /** Make results visible now (or keep the scheduled time if it is already in the past). */
  async releaseResults(id: string, user: AuthUser): Promise<ExamDto> {
    const exam = await this.loadOwned(id, user);
    if (exam.status === 'DRAFT') throw this.notEditable('Publish the exam first');
    const now = await dbNow(this.prisma);
    if (!exam.resultsReleaseAt || exam.resultsReleaseAt > now) {
      await this.prisma.exam.update({
        where: { id },
        data: { resultsReleaseAt: now, version: { increment: 1 } },
      });
      await this.audit.log({
        entityType: 'exam',
        entityId: id,
        actorId: user.id,
        action: 'RESULTS_RELEASED',
        oldValue: { resultsReleaseAt: exam.resultsReleaseAt },
        newValue: { resultsReleaseAt: now },
      });
    }
    return this.dto(id);
  }

  // ── Assignments ──

  async listAssignments(id: string, user: AuthUser) {
    await this.loadOwned(id, user);
    return this.prisma.examAssignment.findMany({
      where: { examId: id },
      orderBy: { createdAt: 'asc' },
      include: {
        student: { select: { id: true, email: true, fullName: true } },
        class: { select: { id: true, name: true, _count: { select: { members: true } } } },
      },
    });
  }

  async assign(id: string, dto: AssignDto, user: AuthUser) {
    const exam = await this.loadOwned(id, user);
    if (exam.status === 'ARCHIVED') throw this.notEditable('Archived exams cannot be assigned');
    const studentIds = [...new Set(dto.studentIds ?? [])];
    const classIds = [...new Set(dto.classIds ?? [])];
    const students = await this.prisma.user.count({ where: { id: { in: studentIds }, role: 'STUDENT' } });
    if (students !== studentIds.length) throw notFound('Student');
    const classes = await this.prisma.class.count({ where: { id: { in: classIds }, ...ownerScope(user) } });
    if (classes !== classIds.length) throw notFound('Class');
    await this.prisma.examAssignment.createMany({
      data: [
        ...studentIds.map((studentId) => ({ examId: id, studentId })),
        ...classIds.map((classId) => ({ examId: id, classId })),
      ],
      skipDuplicates: true,
    });
    return this.listAssignments(id, user);
  }

  async unassign(id: string, assignmentId: string, user: AuthUser) {
    await this.loadOwned(id, user);
    await this.prisma.examAssignment.deleteMany({ where: { id: assignmentId, examId: id } });
  }

  // ── helpers ──

  async loadOwned(id: string, user: AuthUser): Promise<Exam> {
    const exam = await this.prisma.exam.findUnique({ where: { id } });
    if (!exam) throw notFound('Exam');
    assertOwnerOrAdmin(exam.ownerId, user, 'Exam');
    return exam;
  }

  private async loadDraft(id: string, user: AuthUser): Promise<Exam> {
    const exam = await this.loadOwned(id, user);
    if (exam.status !== 'DRAFT') throw this.notEditable('Questions of a published exam are frozen');
    return exam;
  }

  private async dto(id: string): Promise<ExamDto> {
    const [exam, now] = await Promise.all([
      this.prisma.exam.findUniqueOrThrow({ where: { id }, include: countsInclude }),
      dbNow(this.prisma),
    ]);
    return toExamDto(exam, now);
  }

  private assertWindow(startAt: Date, endAt: Date): void {
    if (!(endAt > startAt)) {
      throw new AppException(ErrorCode.EXAM_INVALID, 'endAt must be after startAt', HttpStatus.BAD_REQUEST);
    }
  }

  private notEditable(message: string) {
    return new AppException(ErrorCode.EXAM_NOT_EDITABLE, message, HttpStatus.CONFLICT);
  }
}
