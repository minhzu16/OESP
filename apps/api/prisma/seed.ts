/**
 * Demo data: one account per role, a question bank, and an exam that is open now.
 *   admin@exam.local / teacher@exam.local / student@exam.local — password: Password123!
 * Safe to re-run: existing demo users are left untouched.
 */
import { PrismaClient, QuestionType } from '@prisma/client';
import { loadDotEnv } from '../src/config/config';
import { hashPassword } from '../src/modules/auth/password';
import { contentHash } from '../src/modules/question-bank/question-input';

loadDotEnv();
const prisma = new PrismaClient();
const PASSWORD = 'Password123!';

const QUESTIONS: { content: string; options: [string, boolean][]; difficulty: number; tags: string[]; type?: QuestionType }[] = [
  { content: 'What is 7 × 8?', options: [['54', false], ['56', true], ['58', false], ['64', false]], difficulty: 1, tags: ['arithmetic'] },
  { content: 'Which of these are prime numbers?', options: [['2', true], ['9', false], ['11', true], ['15', false]], difficulty: 2, tags: ['number-theory'], type: 'MULTIPLE' },
  { content: 'The square root of 144 is 12.', options: [['True', true], ['False', false]], difficulty: 1, tags: ['arithmetic'], type: 'TRUE_FALSE' },
  { content: 'Solve for x: 2x + 6 = 14', options: [['3', false], ['4', true], ['5', false], ['8', false]], difficulty: 2, tags: ['algebra'] },
  { content: 'What is the derivative of x²?', options: [['x', false], ['2x', true], ['x²/2', false], ['2', false]], difficulty: 3, tags: ['calculus'] },
  { content: 'Which values satisfy x² = 9?', options: [['3', true], ['-3', true], ['9', false], ['0', false]], difficulty: 2, tags: ['algebra'], type: 'MULTIPLE' },
  { content: 'What is 15% of 200?', options: [['15', false], ['20', false], ['30', true], ['35', false]], difficulty: 1, tags: ['arithmetic'] },
  { content: 'The sum of interior angles of a triangle is 180°.', options: [['True', true], ['False', false]], difficulty: 1, tags: ['geometry'], type: 'TRUE_FALSE' },
  { content: 'Area of a circle with radius 3 (π ≈ 3.14)?', options: [['18.84', false], ['28.26', true], ['9.42', false], ['31.4', false]], difficulty: 2, tags: ['geometry'] },
  { content: '∫ 2x dx = ?', options: [['x² + C', true], ['2x² + C', false], ['x + C', false], ['2 + C', false]], difficulty: 3, tags: ['calculus'] },
  { content: 'What is log₁₀(1000)?', options: [['2', false], ['3', true], ['10', false], ['100', false]], difficulty: 2, tags: ['algebra'] },
  { content: 'Which numbers are divisible by 3?', options: [['12', true], ['14', false], ['21', true], ['25', false]], difficulty: 1, tags: ['number-theory'], type: 'MULTIPLE' },
];

async function user(email: string, fullName: string, role: 'ADMIN' | 'TEACHER' | 'STUDENT', passwordHash: string) {
  return prisma.user.upsert({ where: { email }, update: {}, create: { email, fullName, role, passwordHash } });
}

async function main() {
  const passwordHash = await hashPassword(PASSWORD);
  await user('admin@exam.local', 'Admin', 'ADMIN', passwordHash);
  const teacher = await user('teacher@exam.local', 'Teacher Nguyen', 'TEACHER', passwordHash);
  const students = await Promise.all(
    ['student', 'student2', 'student3'].map((n, i) =>
      user(`${n}@exam.local`, `Student ${i + 1}`, 'STUDENT', passwordHash),
    ),
  );

  if (await prisma.exam.findFirst({ where: { title: 'Math Midterm (demo)' } })) {
    console.log('Demo data already present.');
    return;
  }

  const subject = await prisma.subject.upsert({
    where: { code: 'MATH' },
    update: {},
    create: { code: 'MATH', name: 'Mathematics' },
  });
  const bank = await prisma.questionBank.create({
    data: { subjectId: subject.id, ownerId: teacher.id, name: 'Math basics', description: 'Demo question bank' },
  });

  const versionIds: string[] = [];
  for (const q of QUESTIONS) {
    const type = q.type ?? 'SINGLE';
    const options = q.options.map(([content, isCorrect]) => ({ content, isCorrect }));
    const question = await prisma.question.create({
      data: { bankId: bank.id, type, difficulty: q.difficulty, tags: q.tags, contentHash: contentHash({ content: q.content, options }) },
    });
    const version = await prisma.questionVersion.create({
      data: {
        questionId: question.id,
        version: 1,
        type,
        content: q.content,
        explanation: null,
        marks: type === 'MULTIPLE' ? 2 : 1,
        createdById: teacher.id,
        options: { create: options.map((o, i) => ({ ...o, orderIndex: i })) },
      },
    });
    await prisma.question.update({ where: { id: question.id }, data: { currentVersionId: version.id } });
    versionIds.push(version.id);
  }

  const cls = await prisma.class.create({
    data: { name: 'Class 10A', ownerId: teacher.id, members: { create: students.map((s) => ({ userId: s.id })) } },
  });

  const now = Date.now();
  const exam = await prisma.exam.create({
    data: {
      ownerId: teacher.id,
      subjectId: subject.id,
      title: 'Math Midterm (demo)',
      instructions: 'Answer all questions. Your answers are saved automatically. The timer is controlled by the server.',
      durationSeconds: 15 * 60,
      startAt: new Date(now - 60 * 60_000),
      endAt: new Date(now + 7 * 24 * 3600_000),
      maxAttempts: 2,
      gradingMethod: 'HIGHEST',
      passMark: 6,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      sections: {
        create: { bankId: bank.id, pickCount: 10, orderIndex: 0 },
      },
      assignments: { create: { classId: cls.id } },
    },
    include: { sections: true },
  });
  await prisma.examPoolItem.createMany({
    data: versionIds.map((questionVersionId) => ({ sectionId: exam.sections[0].id, questionVersionId })),
  });

  console.log('Seeded demo data. Accounts (password %s):', PASSWORD);
  console.log('  admin@exam.local, teacher@exam.local, student@exam.local, student2@exam.local, student3@exam.local');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
