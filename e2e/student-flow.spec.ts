import { APIRequestContext, expect, Page, test } from '@playwright/test';

/**
 * Golden path for a student, including the two failure modes the system must survive:
 * a page reload in the middle of the exam and a network outage.
 * Needs the seeded teacher and "Math basics" bank (apps/api/prisma/seed.ts); each run creates
 * its own exam and student so it can be repeated against the same database.
 */
const PASSWORD = 'Password123!';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function prepareExam(request: APIRequestContext) {
  const run = Date.now();
  const teacher = await (
    await request.post('/api/v1/auth/login', { data: { email: 'teacher@exam.local', password: PASSWORD } })
  ).json();
  const headers = { Authorization: `Bearer ${teacher.accessToken}` };
  const banks: { id: string; name: string }[] = await (await request.get('/api/v1/banks', { headers })).json();
  const bank = banks.find((b) => b.name === 'Math basics');
  expect(bank, 'seeded bank "Math basics" is required').toBeDefined();

  const title = `E2E exam ${run}`;
  const exam = await (
    await request.post('/api/v1/exams', {
      headers,
      data: {
        title,
        durationSeconds: 900,
        startAt: new Date(run - 60_000).toISOString(),
        endAt: new Date(run + 3_600_000).toISOString(),
      },
    })
  ).json();
  expect((await request.put(`/api/v1/exams/${exam.id}/sections`, { headers, data: { sections: [{ bankId: bank!.id, pickCount: 5 }] } })).ok()).toBe(true);
  expect((await request.post(`/api/v1/exams/${exam.id}/publish`, { headers })).ok()).toBe(true);

  const email = `e2e-${run}@exam.local`;
  const student = await (
    await request.post('/api/v1/auth/register', { data: { email, password: PASSWORD, fullName: `E2E ${run}` } })
  ).json();
  expect(
    (await request.post(`/api/v1/exams/${exam.id}/assignments`, { headers, data: { studentIds: [student.user.id] } })).ok(),
  ).toBe(true);
  return { title, email };
}

test('student takes an exam: resume after reload, answer offline, submit, see released result', async ({ page, context, request }) => {
  const { title, email } = await prepareExam(request);

  await login(page, email);
  await expect(page.getByRole('heading', { name: 'My exams' })).toBeVisible();
  const card = page.locator('.card', { hasText: title });
  page.once('dialog', (d) => d.accept());
  await card.getByRole('button', { name: 'Begin exam' }).click();
  await expect(page).toHaveURL(/\/attempts\/[0-9a-f-]+$/);
  await expect(page.locator('.timer')).toHaveText(/\d\d:\d\d/);

  // Answer question 1 and wait until it is persisted on the server.
  await page.locator('.option').first().click();
  await expect(page.getByText('All answers saved')).toBeVisible();

  // Reload: the attempt resumes with the same answer and the timer keeps running.
  await page.reload();
  await expect(page.locator('.option.selected')).toHaveCount(1);
  await expect(page.locator('.palette button.answered')).toHaveCount(1);

  // Go offline, answer question 2: kept locally, banner shown.
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.getByRole('button', { name: 'Next question →' }).click();
  await page.locator('.option').nth(1).click();
  await expect(page.getByText(/Connection lost/)).toBeVisible();
  await expect(page.locator('.palette button.answered')).toHaveCount(2);

  // Back online: the queued answer is delivered.
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('All answers saved')).toBeVisible({ timeout: 20_000 });

  // Submit with the confirmation dialog listing unanswered questions.
  await page.getByRole('button', { name: 'Submit attempt' }).click();
  await expect(page.getByText(/questions are unanswered/)).toBeVisible();
  await page.getByRole('button', { name: 'Submit now' }).click();
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByText('Attempt submitted & recorded')).toBeVisible();
  const resultUrl = page.url();

  // Teacher releases results.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await login(page, 'teacher@exam.local');
  await page.getByRole('link', { name: title }).click();
  await page.getByRole('button', { name: 'Release results now' }).click();
  await expect(page.getByRole('button', { name: 'Release results now' })).toBeDisabled();

  // Student sees score and per-question review with exactly the 2 answers given.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await login(page, email);
  await page.goto(resultUrl);
  await expect(page.getByText('Score percentage')).toBeVisible();
  await expect(page.getByText('Your answer', { exact: true })).toHaveCount(2);
});
