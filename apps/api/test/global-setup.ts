import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Integration tests run against a real PostgreSQL (partial indexes, triggers, row locks and
 * SKIP LOCKED cannot be faked). Uses TEST_DATABASE_URL when given (CI service container),
 * otherwise starts a throwaway container with Testcontainers. Either way the database is
 * expected to be fresh: only the non-destructive `migrate deploy` runs here, and suites
 * TRUNCATE their own data between tests.
 */
export default async function globalSetup(): Promise<void> {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('exam_test')
      .withUsername('exam')
      .withPassword('exam')
      .start();
    (globalThis as any).__PG_CONTAINER__ = container;
    url = container.getConnectionUri();
  }
  process.env.INTEGRATION_DATABASE_URL = url;

  const prismaCli = path.join(path.dirname(require.resolve('prisma/package.json')), 'build', 'index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
