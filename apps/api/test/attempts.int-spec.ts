import type { AttemptView } from '@exam/shared';
import {
  answerAll,
  bearer,
  createTestApp,
  createUser,
  makeOverdue,
  resetDb,
  setupExam,
  startAttempt,
  TestCtx,
} from './helpers';

describe('Attempts (start / autosave / submit / expiry)', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });

  describe('start', () => {
    it('creates an attempt with a server-computed deadline and hides answer keys', async () => {
      const setup = await setupExam(ctx, { durationSeconds: 600 });
      const res = await startAttempt(ctx, setup).expect(201);
      const view = res.body as AttemptView;

      expect(view.status).toBe('IN_PROGRESS');
      expect(view.questions).toHaveLength(5);
      const started = new Date(view.startedAt).getTime();
      expect(new Date(view.deadlineAt).getTime() - started).toBe(600_000);
      expect(view.serverTime).toBeDefined();
      expect(JSON.stringify(view)).not.toMatch(/isCorrect|explanation/);
    });

    it('caps the deadline at the exam end time', async () => {
      const setup = await setupExam(ctx, { durationSeconds: 3600, endOffsetMinutes: 5 });
      const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      const exam = await ctx.prisma.exam.findUniqueOrThrow({ where: { id: setup.examId } });
      expect(new Date(view.deadlineAt).getTime()).toBe(exam.endAt.getTime());
    });

    it('is idempotent: a second start resumes the same attempt with the same order', async () => {
      const setup = await setupExam(ctx);
      const first = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      const second = (await startAttempt(ctx, setup).expect(200)).body as AttemptView;
      expect(second.id).toBe(first.id);
      expect(second.questions.map((q) => [q.questionVersionId, q.options.map((o) => o.id)])).toEqual(
        first.questions.map((q) => [q.questionVersionId, q.options.map((o) => o.id)]),
      );
    });

    it('10 concurrent starts produce exactly one attempt', async () => {
      const setup = await setupExam(ctx);
      const responses = await Promise.all(Array.from({ length: 10 }, () => startAttempt(ctx, setup)));
      expect(responses.every((r) => r.status === 200 || r.status === 201)).toBe(true);
      expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
      expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
      expect(await ctx.prisma.attempt.count()).toBe(1);
    });

    it('the database rejects a second IN_PROGRESS attempt even if the app logic is bypassed', async () => {
      const setup = await setupExam(ctx, { maxAttempts: 3 });
      const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      await expect(
        ctx.prisma.attempt.create({
          data: {
            examId: setup.examId,
            studentId: setup.student.id,
            attemptNo: 2,
            deadlineAt: new Date(Date.now() + 60_000),
            seed: 1,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      expect(view.id).toBeDefined();
    });

    it('rejects starts outside the exam window', async () => {
      const early = await setupExam(ctx, { startOffsetMinutes: 30, endOffsetMinutes: 90 });
      const r1 = await startAttempt(ctx, early).expect(409);
      expect(r1.body.error.code).toBe('EXAM_NOT_OPEN');

      const late = await setupExam(ctx, { startOffsetMinutes: -90, endOffsetMinutes: -30 });
      const r2 = await startAttempt(ctx, late).expect(409);
      expect(r2.body.error.code).toBe('EXAM_CLOSED');
    });

    it('enforces max attempts', async () => {
      const setup = await setupExam(ctx, { maxAttempts: 1 });
      const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      await ctx.api().post(`/api/v1/attempts/${view.id}/submit`).set(bearer(setup.student.token)).expect(200);
      const res = await startAttempt(ctx, setup).expect(409);
      expect(res.body.error.code).toBe('NO_ATTEMPTS_LEFT');
    });

    it('returns 404 for students who are not assigned', async () => {
      const setup = await setupExam(ctx);
      const outsider = await createUser(ctx, 'STUDENT');
      await startAttempt(ctx, setup, outsider.token).expect(404);
    });

    it('allows students assigned through a class', async () => {
      const setup = await setupExam(ctx);
      const classmate = await createUser(ctx, 'STUDENT');
      const t = bearer(setup.teacher.token);
      const cls = await ctx.api().post('/api/v1/classes').set(t).send({ name: '10A' }).expect(201);
      await ctx.api().post(`/api/v1/classes/${cls.body.id}/members`).set(t).send({ emails: [classmate.email] }).expect(201);
      await ctx.api().post(`/api/v1/exams/${setup.examId}/assignments`).set(t).send({ classIds: [cls.body.id] }).expect(201);
      await startAttempt(ctx, setup, classmate.token).expect(201);
    });

    it('draws a random subset from the frozen pool', async () => {
      const setup = await setupExam(ctx, { questions: 8, pick: 3 });
      const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      expect(view.questions).toHaveLength(3);
      expect(new Set(view.questions.map((q) => q.questionVersionId)).size).toBe(3);
    });
  });

  describe('autosave', () => {
    it('saves, replays the same seq idempotently, and rejects stale seqs', async () => {
      const setup = await setupExam(ctx);
      const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      const q = view.questions[0];
      const url = `/api/v1/attempts/${view.id}/answers/${q.questionVersionId}`;
      const s = bearer(setup.student.token);

      await ctx.api().put(url).set(s).send({ selectedOptionIds: [q.options[0].id], seq: 5 }).expect(200);
      await ctx.api().put(url).set(s).send({ selectedOptionIds: [q.options[0].id], seq: 5 }).expect(200);
      const stale = await ctx.api().put(url).set(s).send({ selectedOptionIds: [q.options[1].id], seq: 4 }).expect(409);
      expect(stale.body.error.code).toBe('STALE_SEQ');
      await ctx.api().put(url).set(s).send({ selectedOptionIds: [q.options[2].id], seq: 6 }).expect(200);

      const saved = await ctx.prisma.attemptAnswer.findMany({ where: { attemptId: view.id } });
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ seq: 6, selectedOptionIds: [q.options[2].id] });
    });

    it('validates options belong to the question and single-choice cardinality', async () => {
      const setup = await setupExam(ctx);
      const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      const [q1, q2] = view.questions;
      const s = bearer(setup.student.token);
      const url = `/api/v1/attempts/${view.id}/answers/${q1.questionVersionId}`;
      await ctx.api().put(url).set(s).send({ selectedOptionIds: [q2.options[0].id], seq: 1 }).expect(400);
      await ctx
        .api()
        .put(url)
        .set(s)
        .send({ selectedOptionIds: [q1.options[0].id, q1.options[1].id], seq: 1 })
        .expect(400);
      await ctx.api().put(url).set(s).send({ selectedOptionIds: [], seq: 1 }).expect(200);
    });

    it('rejects saves after the deadline and closes the attempt', async () => {
      const setup = await setupExam(ctx);
      const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      await makeOverdue(ctx, view.id);
      const q = view.questions[0];
      const res = await ctx
        .api()
        .put(`/api/v1/attempts/${view.id}/answers/${q.questionVersionId}`)
        .set(bearer(setup.student.token))
        .send({ selectedOptionIds: [q.options[0].id], seq: 1 })
        .expect(409);
      expect(res.body.error.code).toBe('ATTEMPT_EXPIRED');
      const attempt = await ctx.prisma.attempt.findUniqueOrThrow({ where: { id: view.id }, include: { result: true } });
      expect(attempt.status).toBe('GRADED');
      expect(attempt.submitReason).toBe('TIMEOUT');
      expect(attempt.result).not.toBeNull();
    });

    it('cannot touch another student\'s attempt (404, no existence leak)', async () => {
      const setup = await setupExam(ctx);
      const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      const other = await createUser(ctx, 'STUDENT');
      const q = view.questions[0];
      await ctx.api().get(`/api/v1/attempts/${view.id}`).set(bearer(other.token)).expect(404);
      await ctx
        .api()
        .put(`/api/v1/attempts/${view.id}/answers/${q.questionVersionId}`)
        .set(bearer(other.token))
        .send({ selectedOptionIds: [q.options[0].id], seq: 1 })
        .expect(404);
      await ctx.api().post(`/api/v1/attempts/${view.id}/submit`).set(bearer(other.token)).expect(404);
    });
  });

  describe('submit', () => {
    it('grades on submit using option ids regardless of shuffling', async () => {
      const setup = await setupExam(ctx, { resultsReleaseAt: new Date(Date.now() - 1000).toISOString() });
      const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      await answerAll(ctx, view, setup.student.token, (pos) => pos < 3);
      const res = await ctx.api().post(`/api/v1/attempts/${view.id}/submit`).set(bearer(setup.student.token)).expect(200);
      expect(res.body).toMatchObject({ status: 'GRADED', alreadySubmitted: false, submitReason: 'MANUAL' });

      const result = await ctx.prisma.result.findUniqueOrThrow({ where: { attemptId: view.id } });
      expect(Number(result.score)).toBe(3);
      expect(Number(result.maxScore)).toBe(5);
      expect(result.correctCount).toBe(3);
      expect(result.wrongCount).toBe(2);
    });

    it('10 concurrent submits produce exactly one grading and one result', async () => {
      const setup = await setupExam(ctx);
      const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      await answerAll(ctx, view, setup.student.token, () => true);

      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          ctx.api().post(`/api/v1/attempts/${view.id}/submit`).set(bearer(setup.student.token)),
        ),
      );
      expect(responses.map((r) => r.status)).toEqual(Array(10).fill(200));
      expect(responses.filter((r) => r.body.alreadySubmitted === false)).toHaveLength(1);
      expect(await ctx.prisma.result.count({ where: { attemptId: view.id } })).toBe(1);
      const attempt = await ctx.prisma.attempt.findUniqueOrThrow({ where: { id: view.id } });
      // IN_PROGRESS → SUBMITTED → GRADED: exactly two state transitions.
      expect(attempt.version).toBe(2);
    });

    it('replays the stored response for a repeated Idempotency-Key', async () => {
      const setup = await setupExam(ctx);
      const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      const send = () =>
        ctx
          .api()
          .post(`/api/v1/attempts/${view.id}/submit`)
          .set(bearer(setup.student.token))
          .set('Idempotency-Key', 'key-1');
      const first = await send().expect(200);
      const second = await send().expect(200);
      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(second.body).toEqual(first.body);
    });

    it('answers cannot be changed after submission (API and DB trigger)', async () => {
      const setup = await setupExam(ctx);
      const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      await ctx.api().post(`/api/v1/attempts/${view.id}/submit`).set(bearer(setup.student.token)).expect(200);
      const q = view.questions[0];
      const res = await ctx
        .api()
        .put(`/api/v1/attempts/${view.id}/answers/${q.questionVersionId}`)
        .set(bearer(setup.student.token))
        .send({ selectedOptionIds: [q.options[0].id], seq: 99 })
        .expect(409);
      expect(res.body.error.code).toBe('ATTEMPT_NOT_IN_PROGRESS');
      await expect(
        ctx.prisma.$executeRaw`INSERT INTO attempt_answers (attempt_id, question_version_id, selected_option_ids, seq)
          VALUES (${view.id}::uuid, ${q.questionVersionId}::uuid, ARRAY[]::uuid[], 100)`,
      ).rejects.toThrow(/answers are frozen/);
    });

    it('a late manual submit is recorded as a timeout with only in-time answers', async () => {
      const setup = await setupExam(ctx);
      const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      await answerAll(ctx, view, setup.student.token, () => true);
      await makeOverdue(ctx, view.id);
      const res = await ctx.api().post(`/api/v1/attempts/${view.id}/submit`).set(bearer(setup.student.token)).expect(200);
      expect(res.body).toMatchObject({ status: 'GRADED', submitReason: 'TIMEOUT' });
    });
  });

  describe('expiry', () => {
    it('the sweeper expires and grades abandoned attempts', async () => {
      const setup = await setupExam(ctx);
      const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      await answerAll(ctx, view, setup.student.token, (pos) => pos === 0);
      await makeOverdue(ctx, view.id);

      expect(await ctx.expiry.sweep()).toBe(1);
      expect(await ctx.expiry.sweep()).toBe(0);
      const attempt = await ctx.prisma.attempt.findUniqueOrThrow({ where: { id: view.id }, include: { result: true } });
      expect(attempt.status).toBe('GRADED');
      expect(attempt.submitReason).toBe('SWEEPER');
      expect(attempt.submittedAt?.getTime()).toBe(attempt.deadlineAt.getTime());
      expect(Number(attempt.result!.score)).toBe(1);
    });

    it('sweeper racing a submit still yields exactly one result', async () => {
      const setup = await setupExam(ctx);
      const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      await makeOverdue(ctx, view.id);
      await Promise.all([
        ctx.expiry.sweep(),
        ctx.api().post(`/api/v1/attempts/${view.id}/submit`).set(bearer(setup.student.token)),
        ctx.expiry.sweep(),
        ctx.api().get(`/api/v1/attempts/${view.id}`).set(bearer(setup.student.token)),
      ]);
      expect(await ctx.prisma.result.count({ where: { attemptId: view.id } })).toBe(1);
    });

    it('reading an overdue attempt closes it lazily', async () => {
      const setup = await setupExam(ctx);
      const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      await makeOverdue(ctx, view.id);
      const res = await ctx.api().get(`/api/v1/attempts/${view.id}`).set(bearer(setup.student.token)).expect(200);
      expect(res.body.status).toBe('GRADED');
      expect(res.body.submitReason).toBe('TIMEOUT');
    });

    it('an overdue in-progress attempt does not block starting the next attempt', async () => {
      const setup = await setupExam(ctx, { maxAttempts: 2 });
      const first = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      await makeOverdue(ctx, first.id);
      const second = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      expect(second.id).not.toBe(first.id);
      expect(second.attemptNo).toBe(2);
    });
  });
});
