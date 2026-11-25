import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@exam/shared';
import { AuthUser } from '../../common/auth.decorators';
import { AppException, notFound } from '../../common/errors';
import { assertOwnerOrAdmin } from '../../common/ownership';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../core/audit.service';

/**
 * Publishing freezes content: fixed questions are pinned to their current version and every
 * random-draw section gets a snapshot pool of question versions. Pools are made disjoint
 * (first matching section wins, fixed questions excluded) so every draw is always feasible.
 */
export async function publishExamTx(
  prisma: PrismaService,
  audit: AuditService,
  id: string,
  user: AuthUser,
): Promise<void> {
  await prisma.$transaction(
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
      if (exam.status !== 'DRAFT') {
        throw new AppException(ErrorCode.EXAM_NOT_EDITABLE, 'Exam is already published', HttpStatus.CONFLICT);
      }
      if (!(exam.endAt > exam.startAt)) {
        throw new AppException(ErrorCode.EXAM_INVALID, 'endAt must be after startAt', HttpStatus.BAD_REQUEST);
      }

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
      if (count === 0) {
        throw new AppException(ErrorCode.EXAM_NOT_EDITABLE, 'Exam is already published', HttpStatus.CONFLICT);
      }
      await audit.log(
        { entityType: 'exam', entityId: id, actorId: user.id, action: 'EXAM_PUBLISHED', newValue: { total } },
        tx,
      );
    },
    { timeout: 30_000 },
  );
}
