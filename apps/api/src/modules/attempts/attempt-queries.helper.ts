import { StudentExamDto } from '@exam/shared';
import { AuthUser } from '../../common/auth.decorators';
import { dbNow, PrismaService } from '../../prisma/prisma.service';
import { examPhase, resultsReleased } from '../exams/exam-rules';

/** Exams assigned to the student (directly or through a class). */
export async function listStudentExams(prisma: PrismaService, user: AuthUser): Promise<StudentExamDto[]> {
  const now = await dbNow(prisma);
  const exams = await prisma.exam.findMany({
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

export async function listStudentAttempts(prisma: PrismaService, user: AuthUser) {
  const now = await dbNow(prisma);
  const attempts = await prisma.attempt.findMany({
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
