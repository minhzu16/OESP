import type { AttemptView } from '@exam/shared';
import { answerAll, bearer, createTestApp, createUser, resetDb, setupExam, startAttempt, TestCtx } from './helpers';

describe('Results (release, protection, regrade, reports)', () => {
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

  async function gradedAttempt(opts: Parameters<typeof setupExam>[1] = {}) {
    const setup = await setupExam(ctx, opts);
    const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
    await answerAll(ctx, view, setup.student.token, (pos) => pos !== 0);
    await ctx.api().post(`/api/v1/attempts/${view.id}/submit`).set(bearer(setup.student.token)).expect(200);
    return { setup, attemptId: view.id };
  }

  it('hides scores until results are released, then shows score and review', async () => {
    const { setup, attemptId } = await gradedAttempt({ passMark: 3 });
    const s = bearer(setup.student.token);

    const hidden = await ctx.api().get(`/api/v1/attempts/${attemptId}/result`).set(s).expect(200);
    expect(hidden.body.released).toBe(false);
    expect(hidden.body.score).toBeUndefined();
    expect(JSON.stringify(hidden.body)).not.toMatch(/isCorrect/);

    await ctx.api().post(`/api/v1/exams/${setup.examId}/release-results`).set(bearer(setup.teacher.token)).expect(200);
    const shown = await ctx.api().get(`/api/v1/attempts/${attemptId}/result`).set(s).expect(200);
    expect(shown.body).toMatchObject({ released: true, score: 4, maxScore: 5, percentage: 80, passed: true });
    expect(shown.body.review).toHaveLength(5);
    expect(shown.body.review.filter((r: { outcome: string }) => r.outcome === 'CORRECT')).toHaveLength(4);
  });

  it('students cannot reach teacher endpoints or other students\' results', async () => {
    const { setup, attemptId } = await gradedAttempt();
    const other = await createUser(ctx, 'STUDENT');
    await ctx.api().get(`/api/v1/attempts/${attemptId}/result`).set(bearer(other.token)).expect(404);
    await ctx
      .api()
      .post(`/api/v1/attempts/${attemptId}/regrade`)
      .set(bearer(setup.student.token))
      .send({ mode: 'OVERRIDE', score: 5, reason: 'please', expectedVersion: 0 })
      .expect(403);
    await ctx.api().get(`/api/v1/exams/${setup.examId}/results`).set(bearer(setup.student.token)).expect(403);
  });

  it('another teacher cannot see or regrade the exam (404)', async () => {
    const { attemptId, setup } = await gradedAttempt();
    const otherTeacher = await createUser(ctx, 'TEACHER');
    await ctx.api().get(`/api/v1/exams/${setup.examId}/results`).set(bearer(otherTeacher.token)).expect(404);
    await ctx
      .api()
      .post(`/api/v1/attempts/${attemptId}/regrade`)
      .set(bearer(otherTeacher.token))
      .send({ mode: 'OVERRIDE', score: 5, reason: 'not my exam', expectedVersion: 0 })
      .expect(404);
  });

  it('direct UPDATE/DELETE on results is blocked by the database', async () => {
    const { attemptId } = await gradedAttempt();
    await expect(
      ctx.prisma.$executeRaw`UPDATE results SET score = 5 WHERE attempt_id = ${attemptId}::uuid`,
    ).rejects.toThrow(/audited regrade/);
    await expect(ctx.prisma.$executeRaw`DELETE FROM results WHERE attempt_id = ${attemptId}::uuid`).rejects.toThrow(
      /immutable/,
    );
  });

  it('regrade writes an audit entry, bumps the version and enforces optimistic locking', async () => {
    const { setup, attemptId } = await gradedAttempt();
    const t = bearer(setup.teacher.token);
    const res = await ctx
      .api()
      .post(`/api/v1/attempts/${attemptId}/regrade`)
      .set(t)
      .send({ mode: 'OVERRIDE', score: 4.5, reason: 'Appeal accepted for Q1', expectedVersion: 0 })
      .expect(201);
    expect(res.body.result).toMatchObject({ score: 4.5, version: 1, integrityOk: true });
    expect(res.body.audit[0]).toMatchObject({ action: 'RESULT_OVERRIDDEN', reason: 'Appeal accepted for Q1' });

    const stale = await ctx
      .api()
      .post(`/api/v1/attempts/${attemptId}/regrade`)
      .set(t)
      .send({ mode: 'RECOMPUTE', reason: 'Second teacher edit', expectedVersion: 0 })
      .expect(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');

    await ctx
      .api()
      .post(`/api/v1/attempts/${attemptId}/regrade`)
      .set(t)
      .send({ mode: 'OVERRIDE', score: 6, reason: 'Too high a score', expectedVersion: 1 })
      .expect(400);
  });

  it('audit log is append-only', async () => {
    const { setup, attemptId } = await gradedAttempt();
    await ctx
      .api()
      .post(`/api/v1/attempts/${attemptId}/regrade`)
      .set(bearer(setup.teacher.token))
      .send({ mode: 'RECOMPUTE', reason: 'Recheck scoring', expectedVersion: 0 })
      .expect(201);
    await expect(ctx.prisma.$executeRaw`UPDATE audit_logs SET reason = 'x'`).rejects.toThrow(/append-only/);
    await expect(ctx.prisma.$executeRaw`DELETE FROM audit_logs`).rejects.toThrow(/append-only/);
  });

  it('detects results tampered with outside the application (HMAC checksum)', async () => {
    const { setup, attemptId } = await gradedAttempt();
    const t = bearer(setup.teacher.token);
    const clean = await ctx.api().get(`/api/v1/integrity/results?examId=${setup.examId}`).set(t).expect(200);
    expect(clean.body).toEqual({ checked: 1, mismatches: [] });

    // A DBA-level actor who knows to set the session variable still cannot forge the HMAC.
    await ctx.prisma.$transaction([
      ctx.prisma.$queryRaw`SELECT set_config('app.audit_reason', 'tamper', true)`,
      ctx.prisma.$executeRaw`UPDATE results SET score = 5 WHERE attempt_id = ${attemptId}::uuid`,
    ]);
    const dirty = await ctx.api().get(`/api/v1/integrity/results?examId=${setup.examId}`).set(t).expect(200);
    expect(dirty.body.mismatches).toEqual([{ attemptId, examId: setup.examId, storedScore: 5 }]);
  });

  it('extends the deadline of an in-progress attempt with an audit trail', async () => {
    const setup = await setupExam(ctx);
    const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
    const res = await ctx
      .api()
      .post(`/api/v1/attempts/${view.id}/extend`)
      .set(bearer(setup.teacher.token))
      .send({ extraSeconds: 300, reason: 'Network outage in room 2' })
      .expect(201);
    expect(new Date(res.body.deadlineAt).getTime() - new Date(view.deadlineAt).getTime()).toBe(300_000);
    expect(res.body.audit[0].action).toBe('DEADLINE_EXTENDED');
  });

  it('gradebook, summary, item analysis and CSV export', async () => {
    const { setup } = await gradedAttempt({ passMark: 2.5 });
    const t = bearer(setup.teacher.token);

    const book = await ctx.api().get(`/api/v1/exams/${setup.examId}/results`).set(t).expect(200);
    expect(book.body.students).toHaveLength(1);
    expect(book.body.students[0]).toMatchObject({ finalScore: 4, maxScore: 5, passed: true });

    const summary = await ctx.api().get(`/api/v1/exams/${setup.examId}/reports/summary`).set(t).expect(200);
    expect(summary.body).toMatchObject({ students: 1, averagePercentage: 80, passRate: 100 });

    const items = await ctx.api().get(`/api/v1/exams/${setup.examId}/reports/items`).set(t).expect(200);
    expect(items.body).toHaveLength(5);
    expect(items.body[0].correctRate).toBe(0);

    const csv = await ctx.api().get(`/api/v1/exams/${setup.examId}/results?format=csv`).set(t).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain('final_score_highest');
    expect(csv.text).toContain(',4,5,80,true');
  });
});
