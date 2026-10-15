import { Injectable } from '@nestjs/common';
import { ResultBreakdownItem } from '@exam/shared';
import { AuthUser } from '../../common/auth.decorators';
import { toCsv } from '../../common/csv';
import { PrismaService } from '../../prisma/prisma.service';
import { ExamsService } from '../exams/exams.service';
import { combineAttemptScores } from '../scoring/scoring';
import { analyseItems, ItemObservation, scoreDistribution } from './item-analysis';

const pct = (score: number, max: number) => (max > 0 ? Math.round((score / max) * 10000) / 100 : 0);

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exams: ExamsService,
  ) {}

  /** Every attempt of an exam plus each student's final mark under the exam's grading method. */
  async gradebook(examId: string, user: AuthUser) {
    const exam = await this.exams.loadOwned(examId, user);
    const attempts = await this.prisma.attempt.findMany({
      where: { examId },
      orderBy: [{ studentId: 'asc' }, { attemptNo: 'asc' }],
      include: {
        student: { select: { id: true, email: true, fullName: true } },
        result: { select: { score: true, maxScore: true, passed: true, version: true } },
      },
    });
    const rows = attempts.map((a) => ({
      attemptId: a.id,
      studentId: a.student.id,
      studentName: a.student.fullName,
      studentEmail: a.student.email,
      attemptNo: a.attemptNo,
      status: a.status,
      startedAt: a.startedAt.toISOString(),
      submittedAt: a.submittedAt?.toISOString() ?? null,
      submitReason: a.submitReason,
      durationSeconds: a.submittedAt ? Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / 1000) : null,
      score: a.result ? Number(a.result.score) : null,
      maxScore: a.result ? Number(a.result.maxScore) : null,
      percentage: a.result ? pct(Number(a.result.score), Number(a.result.maxScore)) : null,
      passed: a.result?.passed ?? null,
      resultVersion: a.result?.version ?? null,
    }));

    const byStudent = new Map<string, typeof rows>();
    for (const r of rows) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);
    const passMark = exam.passMark === null ? null : Number(exam.passMark);
    const students = [...byStudent.values()].map((list) => {
      const graded = list.filter((r) => r.score !== null) as (typeof rows[number] & { score: number; maxScore: number })[];
      const finalScore = combineAttemptScores(
        exam.gradingMethod,
        graded.map((r) => ({ attemptNo: r.attemptNo, score: r.score })),
      );
      const maxScore = graded[0]?.maxScore ?? null;
      return {
        studentId: list[0].studentId,
        studentName: list[0].studentName,
        studentEmail: list[0].studentEmail,
        attempts: list.length,
        finalScore,
        maxScore,
        percentage: finalScore !== null && maxScore ? pct(finalScore, maxScore) : null,
        passed: finalScore === null || passMark === null ? null : finalScore >= passMark,
      };
    });
    return { examId, title: exam.title, gradingMethod: exam.gradingMethod, rows, students };
  }

  async gradebookCsv(examId: string, user: AuthUser, view: 'attempts' | 'students' = 'students'): Promise<string> {
    const g = await this.gradebook(examId, user);
    if (view === 'attempts') {
      return toCsv(
        ['student_name', 'student_email', 'attempt_no', 'status', 'started_at', 'submitted_at', 'submit_reason', 'duration_s', 'score', 'max_score', 'percentage', 'passed'],
        g.rows.map((r) => [r.studentName, r.studentEmail, r.attemptNo, r.status, r.startedAt, r.submittedAt, r.submitReason, r.durationSeconds, r.score, r.maxScore, r.percentage, r.passed]),
      );
    }
    return toCsv(
      ['student_name', 'student_email', 'attempts', `final_score_${g.gradingMethod.toLowerCase()}`, 'max_score', 'percentage', 'passed'],
      g.students.map((s) => [s.studentName, s.studentEmail, s.attempts, s.finalScore, s.maxScore, s.percentage, s.passed]),
    );
  }

  async summary(examId: string, user: AuthUser) {
    const g = await this.gradebook(examId, user);
    const finals = g.students.filter((s) => s.percentage !== null);
    const percentages = finals.map((s) => s.percentage!);
    const sorted = [...percentages].sort((a, b) => a - b);
    const median =
      sorted.length === 0
        ? null
        : sorted.length % 2
          ? sorted[(sorted.length - 1) / 2]
          : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    const withPass = finals.filter((s) => s.passed !== null);
    const statuses: Record<string, number> = {};
    for (const r of g.rows) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
    return {
      examId,
      students: g.students.length,
      gradedStudents: finals.length,
      attempts: g.rows.length,
      attemptsByStatus: statuses,
      averagePercentage: percentages.length ? Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 100) / 100 : null,
      medianPercentage: median,
      minPercentage: sorted[0] ?? null,
      maxPercentage: sorted[sorted.length - 1] ?? null,
      passRate: withPass.length ? Math.round((withPass.filter((s) => s.passed).length / withPass.length) * 1000) / 10 : null,
      distribution: scoreDistribution(percentages),
    };
  }

  /** Per-question statistics over all graded attempts. */
  async items(examId: string, user: AuthUser) {
    await this.exams.loadOwned(examId, user);
    const attempts = await this.prisma.attempt.findMany({
      where: { examId, status: 'GRADED' },
      include: { result: true, answers: true },
    });
    const observations: ItemObservation[] = [];
    for (const a of attempts) {
      if (!a.result) continue;
      const answers = new Map(a.answers.map((x) => [x.questionVersionId, x.selectedOptionIds]));
      for (const b of a.result.breakdown as unknown as ResultBreakdownItem[]) {
        observations.push({
          attemptId: a.id,
          totalScore: Number(a.result.score),
          questionVersionId: b.questionVersionId,
          outcome: b.outcome,
          selectedOptionIds: answers.get(b.questionVersionId) ?? [],
        });
      }
    }
    const stats = analyseItems(observations);
    const versions = await this.prisma.questionVersion.findMany({
      where: { id: { in: stats.map((s) => s.questionVersionId) } },
      include: { options: { orderBy: { orderIndex: 'asc' } } },
    });
    const byId = new Map(versions.map((v) => [v.id, v]));
    return stats
      .map((s) => {
        const v = byId.get(s.questionVersionId)!;
        return {
          ...s,
          questionId: v.questionId,
          version: v.version,
          type: v.type,
          content: v.content,
          options: v.options.map((o) => ({
            id: o.id,
            content: o.content,
            isCorrect: o.isCorrect,
            selected: s.optionCounts[o.id] ?? 0,
          })),
          flags: [
            ...(s.responses >= 5 && s.correctRate < 0.2 ? ['VERY_HARD'] : []),
            ...(s.responses >= 5 && s.correctRate > 0.95 ? ['VERY_EASY'] : []),
            ...(s.discrimination !== null && s.discrimination < 0 ? ['NEGATIVE_DISCRIMINATION'] : []),
          ],
        };
      })
      .sort((a, b) => a.correctRate - b.correctRate);
  }
}
