import type { AttemptView } from '@exam/shared';
import { bearer, createTestApp, createUser, resetDb, setupExam, startAttempt, TestCtx } from './helpers';

describe('Auth, RBAC and question bank', () => {
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

  describe('auth', () => {
    it('registers students only and rejects unknown fields such as role', async () => {
      await ctx
        .api()
        .post('/api/v1/auth/register')
        .send({ email: 'evil@test.local', password: 'password123', fullName: 'Evil', role: 'ADMIN' })
        .expect(400);
      const res = await ctx
        .api()
        .post('/api/v1/auth/register')
        .send({ email: 'Ann@Test.local', password: 'password123', fullName: 'Ann' })
        .expect(201);
      expect(res.body.user).toMatchObject({ email: 'ann@test.local', role: 'STUDENT' });
      expect(res.headers['set-cookie'][0]).toMatch(/rt=.*HttpOnly.*SameSite=Strict/i);
    });

    it('rotates refresh tokens and revokes the family on reuse', async () => {
      const reg = await ctx
        .api()
        .post('/api/v1/auth/register')
        .send({ email: 'bob@test.local', password: 'password123', fullName: 'Bob' })
        .expect(201);
      const cookie1 = reg.headers['set-cookie'][0].split(';')[0];
      const r1 = await ctx.api().post('/api/v1/auth/refresh').set('Cookie', cookie1).expect(200);
      const cookie2 = r1.headers['set-cookie'][0].split(';')[0];
      expect(cookie2).not.toBe(cookie1);

      // Replaying the old token is treated as theft: the whole family is revoked.
      await ctx.api().post('/api/v1/auth/refresh').set('Cookie', cookie1).expect(401);
      await ctx.api().post('/api/v1/auth/refresh').set('Cookie', cookie2).expect(401);
    });

    it('locks the account after repeated failures', async () => {
      const user = await createUser(ctx, 'STUDENT');
      for (let i = 0; i < 5; i++) {
        await ctx.api().post('/api/v1/auth/login').send({ email: user.email, password: 'wrong-pass' }).expect(401);
      }
      const res = await ctx
        .api()
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'password123' })
        .expect(401);
      expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
    });

    it('enforces roles', async () => {
      const student = await createUser(ctx, 'STUDENT');
      const teacher = await createUser(ctx, 'TEACHER');
      await ctx.api().get('/api/v1/banks').expect(401);
      await ctx.api().get('/api/v1/banks').set(bearer(student.token)).expect(403);
      await ctx.api().get('/api/v1/banks').set(bearer(teacher.token)).expect(200);
      await ctx.api().get('/api/v1/admin/users').set(bearer(teacher.token)).expect(403);
      await ctx.api().get('/api/v1/me/exams').set(bearer(teacher.token)).expect(403);
    });
  });

  describe('question bank', () => {
    it('editing a question creates a new version; published exams keep the frozen one', async () => {
      const setup = await setupExam(ctx, { questions: 2 });
      const t = bearer(setup.teacher.token);
      const before = await ctx.api().get(`/api/v1/questions/${setup.questionIds[0]}`).set(t).expect(200);

      const edited = await ctx
        .api()
        .put(`/api/v1/questions/${setup.questionIds[0]}`)
        .set(t)
        .send({
          type: 'SINGLE',
          difficulty: 2,
          tags: ['t'],
          content: 'Question 1 (edited)',
          marks: 1,
          negativeMarks: 0,
          options: [
            { content: 'Correct 1', isCorrect: false },
            { content: 'Wrong A 1', isCorrect: true },
            { content: 'Wrong B 1', isCorrect: false },
          ],
        })
        .expect(200);
      expect(edited.body.version).toBe(2);
      expect(edited.body.versions).toHaveLength(2);

      const view = (await startAttempt(ctx, setup).expect(201)).body as AttemptView;
      expect(view.questions.map((q) => q.questionVersionId)).toContain(before.body.versionId);
      expect(view.questions.map((q) => q.content)).not.toContain('Question 1 (edited)');
    });

    it('a metadata-only edit does not create a version', async () => {
      const setup = await setupExam(ctx, { questions: 1 });
      const t = bearer(setup.teacher.token);
      const q = (await ctx.api().get(`/api/v1/questions/${setup.questionIds[0]}`).set(t).expect(200)).body;
      const res = await ctx
        .api()
        .put(`/api/v1/questions/${q.id}`)
        .set(t)
        .send({
          type: q.type,
          difficulty: 4,
          tags: ['algebra'],
          content: q.content,
          marks: q.marks,
          negativeMarks: q.negativeMarks,
          options: q.options.map((o: { content: string; isCorrect: boolean }) => ({
            content: o.content,
            isCorrect: o.isCorrect,
          })),
        })
        .expect(200);
      expect(res.body).toMatchObject({ version: 1, difficulty: 4, tags: ['algebra'] });
    });

    it('validates question rules', async () => {
      const setup = await setupExam(ctx, { questions: 1 });
      const res = await ctx
        .api()
        .post(`/api/v1/banks/${setup.bankId}/questions`)
        .set(bearer(setup.teacher.token))
        .send({
          type: 'SINGLE',
          difficulty: 1,
          tags: [],
          content: 'Two answers?',
          marks: 1,
          negativeMarks: 0,
          options: [
            { content: 'a', isCorrect: true },
            { content: 'b', isCorrect: true },
          ],
        })
        .expect(400);
      expect(res.body.error.details).toContain('SINGLE questions need exactly 1 correct option');
    });

    it('imports plain text, skipping duplicates and reporting errors', async () => {
      const setup = await setupExam(ctx, { questions: 1 });
      const content = [
        'Question 1', 'A. Correct 1', '*B. Wrong A 1', 'C. Wrong B 1', // same text/options as existing → duplicate
        '',
        'Capital of France?', 'A. Berlin', '*B. Paris', 'C. Rome',
        '',
        'Pick primes', 'A. 2', 'B. 3', 'C. 4', 'ANSWER: A,B',
        '',
        'No answer marked', 'A. x', 'B. y',
      ].join('\n');
      const res = await ctx
        .api()
        .post(`/api/v1/banks/${setup.bankId}/import`)
        .set(bearer(setup.teacher.token))
        .send({ format: 'text', content })
        .expect(200);
      expect(res.body).toMatchObject({ parsed: 3, created: 2 });
      expect(res.body.duplicates).toHaveLength(1);
      expect(res.body.errors).toHaveLength(1);
      const multiple = await ctx.prisma.question.findFirst({ where: { type: 'MULTIPLE' } });
      expect(multiple).not.toBeNull();
    });

    it('refuses to publish when a section pool is too small, and freezes content once published', async () => {
      const teacher = await createUser(ctx, 'TEACHER');
      const t = bearer(teacher.token);
      const subject = await ctx.api().post('/api/v1/subjects').set(t).send({ code: 'M1', name: 'Math' }).expect(201);
      const bank = await ctx.api().post('/api/v1/banks').set(t).send({ subjectId: subject.body.id, name: 'B' }).expect(201);
      const exam = await ctx
        .api()
        .post('/api/v1/exams')
        .set(t)
        .send({
          title: 'E',
          durationSeconds: 600,
          startAt: new Date(Date.now() - 60_000).toISOString(),
          endAt: new Date(Date.now() + 3_600_000).toISOString(),
        })
        .expect(201);
      await ctx.api().put(`/api/v1/exams/${exam.body.id}/sections`).set(t).send({ sections: [{ bankId: bank.body.id, pickCount: 3 }] }).expect(200);
      const res = await ctx.api().post(`/api/v1/exams/${exam.body.id}/publish`).set(t).expect(400);
      expect(res.body.error.code).toBe('EXAM_INVALID');

      const setup = await setupExam(ctx, { questions: 2 });
      const locked = await ctx
        .api()
        .patch(`/api/v1/exams/${setup.examId}`)
        .set(bearer(setup.teacher.token))
        .send({ durationSeconds: 1200 })
        .expect(409);
      expect(locked.body.error.code).toBe('EXAM_NOT_EDITABLE');
      await ctx
        .api()
        .patch(`/api/v1/exams/${setup.examId}`)
        .set(bearer(setup.teacher.token))
        .send({ title: 'Renamed' })
        .expect(200);
    });
  });
});
