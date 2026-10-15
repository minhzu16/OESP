import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { AttemptView } from '@exam/shared';
import { AppModule } from '../src/app.module';
import { resetConfig } from '../src/config/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/setup';
import { hashPassword } from '../src/modules/auth/password';
import { ExpiryService } from '../src/modules/core/expiry.service';

export interface TestCtx {
  app: INestApplication;
  prisma: PrismaService;
  expiry: ExpiryService;
  api: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestCtx> {
  resetConfig();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  // Listen once so supertest reuses the server instead of binding per request.
  await app.listen(0);
  return {
    app,
    prisma: app.get(PrismaService),
    expiry: app.get(ExpiryService),
    api: () => request(app.getHttpServer()),
  };
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

let passwordHash: string | null = null;
let seq = 0;

export async function createUser(
  ctx: TestCtx,
  role: 'ADMIN' | 'TEACHER' | 'STUDENT',
  name = `${role.toLowerCase()}${++seq}`,
): Promise<{ id: string; email: string; token: string }> {
  passwordHash ??= await hashPassword('password123');
  const email = `${name}@test.local`;
  const user = await ctx.prisma.user.create({ data: { email, fullName: name, role, passwordHash } });
  const res = await ctx.api().post('/api/v1/auth/login').send({ email, password: 'password123' }).expect(200);
  return { id: user.id, email, token: res.body.accessToken };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface ExamSetup {
  teacher: { id: string; token: string };
  student: { id: string; token: string };
  examId: string;
  bankId: string;
  questionIds: string[];
}

export interface ExamOptions {
  questions?: number;
  pick?: number;
  durationSeconds?: number;
  startOffsetMinutes?: number;
  endOffsetMinutes?: number;
  maxAttempts?: number;
  resultsReleaseAt?: string | null;
  shuffle?: boolean;
  passMark?: number | null;
}

/** Teacher creates a bank with N single-choice questions, a published exam, and assigns a student. */
export async function setupExam(ctx: TestCtx, opts: ExamOptions = {}): Promise<ExamSetup> {
  const teacher = await createUser(ctx, 'TEACHER');
  const student = await createUser(ctx, 'STUDENT');
  const t = bearer(teacher.token);

  const subject = await ctx
    .api()
    .post('/api/v1/subjects')
    .set(t)
    .send({ code: `S${++seq}`, name: 'Subject' })
    .expect(201);
  const bank = await ctx
    .api()
    .post('/api/v1/banks')
    .set(t)
    .send({ subjectId: subject.body.id, name: 'Bank' })
    .expect(201);

  const questionIds: string[] = [];
  for (let i = 1; i <= (opts.questions ?? 5); i++) {
    const q = await ctx
      .api()
      .post(`/api/v1/banks/${bank.body.id}/questions`)
      .set(t)
      .send({
        type: 'SINGLE',
        difficulty: 1,
        tags: ['t'],
        content: `Question ${i}`,
        marks: 1,
        negativeMarks: 0,
        options: [
          { content: `Correct ${i}`, isCorrect: true },
          { content: `Wrong A ${i}`, isCorrect: false },
          { content: `Wrong B ${i}`, isCorrect: false },
        ],
      })
      .expect(201);
    questionIds.push(q.body.id);
  }

  const now = Date.now();
  const exam = await ctx
    .api()
    .post('/api/v1/exams')
    .set(t)
    .send({
      title: 'Exam',
      durationSeconds: opts.durationSeconds ?? 600,
      startAt: new Date(now + (opts.startOffsetMinutes ?? -60) * 60_000).toISOString(),
      endAt: new Date(now + (opts.endOffsetMinutes ?? 60) * 60_000).toISOString(),
      maxAttempts: opts.maxAttempts ?? 1,
      resultsReleaseAt: opts.resultsReleaseAt === undefined ? null : opts.resultsReleaseAt,
      shuffleQuestions: opts.shuffle ?? true,
      shuffleOptions: opts.shuffle ?? true,
      passMark: opts.passMark ?? null,
    })
    .expect(201);
  await ctx
    .api()
    .put(`/api/v1/exams/${exam.body.id}/sections`)
    .set(t)
    .send({ sections: [{ bankId: bank.body.id, pickCount: opts.pick ?? opts.questions ?? 5 }] })
    .expect(200);
  await ctx.api().post(`/api/v1/exams/${exam.body.id}/publish`).set(t).expect(200);
  await ctx
    .api()
    .post(`/api/v1/exams/${exam.body.id}/assignments`)
    .set(t)
    .send({ studentIds: [student.id] })
    .expect(201);

  return { teacher, student, examId: exam.body.id, bankId: bank.body.id, questionIds };
}

export function startAttempt(ctx: TestCtx, setup: ExamSetup, token = setup.student.token) {
  return ctx.api().post(`/api/v1/exams/${setup.examId}/attempts`).set(bearer(token)).send({});
}

/** Answers every question; `correct` decides whether the right option is chosen. */
export async function answerAll(ctx: TestCtx, view: AttemptView, token: string, correct: (pos: number) => boolean) {
  let s = 0;
  for (const q of view.questions) {
    const option = q.options.find((o) => o.content.startsWith('Correct') === correct(q.position))!;
    await ctx
      .api()
      .put(`/api/v1/attempts/${view.id}/answers/${q.questionVersionId}`)
      .set(bearer(token))
      .send({ selectedOptionIds: [option.id], seq: ++s })
      .expect(200);
  }
}

/** Moves an attempt's deadline into the past (simulates time passing). */
export async function makeOverdue(ctx: TestCtx, attemptId: string): Promise<void> {
  await ctx.prisma.$executeRaw`
    UPDATE attempts SET started_at = now() - interval '20 minutes', deadline_at = now() - interval '1 minute'
     WHERE id = ${attemptId}::uuid`;
}
