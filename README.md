# Online Examination and Result System

Multi-user online exam platform: question banks, scheduled exams with time limits, randomised
per-student papers, autosave with offline recovery, automatic grading, result release and reports.
The server is the source of truth for **time**, **answers** and **scores**; the client only displays them.

**Stack:** NestJS 11 · PostgreSQL 16 · Prisma 6 · Redis + BullMQ · React 19 + Vite + TanStack Query ·
Docker · GitHub Actions · Caddy

```
apps/api         NestJS API + background worker (same image)
apps/web         React SPA
packages/shared  enums, error codes and DTO types shared by API and web
e2e/             Playwright end-to-end test
load/            k6 load test
scripts/         deploy, backup/restore, DB hardening
```

## Quick start (development)

Prerequisites: Node 22+, pnpm 11 (`corepack enable`), Docker.

```bash
pnpm install
docker compose up -d postgres redis      # host ports configurable: POSTGRES_PORT / REDIS_PORT in ./.env
cp apps/api/.env.example apps/api/.env   # adjust DATABASE_URL / REDIS_URL if you changed the ports
pnpm build:shared
pnpm db:migrate && pnpm db:seed
pnpm dev                                 # API :4000 + web :5173
pnpm dev:worker                          # expiry sweeper, catch-up grader, integrity checks
```

Open http://localhost:5173. Seeded accounts (password `Password123!`):
`admin@exam.local`, `teacher@exam.local`, `student@exam.local`, `student2@exam.local`, `student3@exam.local`.
The seed creates an open exam "Math Midterm (demo)" assigned to all three students.

API docs (Swagger): http://localhost:4000/api/docs · health: `/api/health` · metrics: `/api/metrics`

## Tests

| Command | What it runs |
|---|---|
| `pnpm --filter @exam/api test:unit` | Scoring engine, random draw/shuffle, deadlines, import parsers, item analysis, checksums |
| `pnpm --filter @exam/api test:int` | API against a **real PostgreSQL** (Testcontainers, or `TEST_DATABASE_URL`): auth/RBAC, IDOR, concurrency, expiry, DB triggers |
| `pnpm --filter @exam/web test` | Client server-clock and autosave queue (retry, persistence, merge by `seq`) |
| `pnpm test:e2e` | Playwright against a running stack: start → reload/resume → offline answer → submit → release → review |
| `k6 run load/exam-load.js` | 500 students starting together, autosaving and double-submitting (p95 thresholds) |

Concurrency tests that must stay green: 10 concurrent starts → 1 attempt; 10 concurrent submits →
1 grading and 1 result; sweeper racing a submit → 1 result.

## The three hard problems

### 1. Duplicate submissions
Layered, with the database as the final arbiter:
1. UI disables Submit and sends a stable `Idempotency-Key: submit:<attemptId>`.
2. **Conditional state transition**: `UPDATE attempts SET status='SUBMITTED' … WHERE id=$1 AND student_id=$2 AND status='IN_PROGRESS' RETURNING id`. Only one request can flip the row; the rest get the current state with `alreadySubmitted: true` ([attempts.service.ts](apps/api/src/modules/attempts/attempts.service.ts)).
3. Grading flips `SUBMITTED/EXPIRED → GRADED` conditionally too, so submit, sweeper and catch-up grader can race safely ([grading.service.ts](apps/api/src/modules/core/grading.service.ts)).
4. `results.attempt_id` is the primary key; answers are upserted on `(attempt_id, question_version_id)`.
5. `Idempotency-Key` responses are stored and replayed ([idempotency.interceptor.ts](apps/api/src/common/idempotency.interceptor.ts)).
6. Starts: per-(exam, student) advisory lock + partial unique index `uq_one_active_attempt … WHERE status='IN_PROGRESS'`.
7. Autosave: monotonic `seq`; `ON CONFLICT … DO UPDATE … WHERE attempt_answers.seq < EXCLUDED.seq`, so retries and out-of-order requests never overwrite newer answers.

### 2. Server-side timing
- `started_at` comes from the **database clock**; `deadline_at = LEAST(started_at + duration, exam.end_at)` is computed once and stored ([exam-rules.ts](apps/api/src/modules/exams/exam-rules.ts)).
- Every autosave/submit checks `now() <= deadline_at + grace` in SQL. Autosave takes `FOR SHARE` on the attempt row, so an answer is either saved before the attempt closes (and graded) or rejected.
- Expiry never depends on the browser: client auto-submit at 0, **lazy expiry** on any read/write of an overdue attempt, and a **sweeper** (`FOR UPDATE SKIP LOCKED`, BullMQ job scheduler) ([expiry.service.ts](apps/api/src/modules/core/expiry.service.ts), [maintenance.runner.ts](apps/api/src/worker/maintenance.runner.ts)).
- The client clock is estimated from response timestamps and anchored to `performance.now()`, so changing the computer's clock does nothing ([serverClock.ts](apps/web/src/features/attempt/serverClock.ts)).
- Exam phase (SCHEDULED/OPEN/CLOSED) is derived from DB time, never stored.

### 3. Protecting results from tampering
- Scores are computed only on the server, from option ids (not display positions). Students' payloads never include `is_correct` or explanations; no endpoint accepts a score from a student.
- Ownership is part of every query; other users' resources return **404**. `forbidNonWhitelisted` rejects fields like `role` or `score`.
- **DB triggers** ([migration.sql](apps/api/prisma/migrations/0001_init/migration.sql)): `results` cannot be deleted and can only be updated inside a transaction that set `app.audit_reason` (the regrade path); `audit_logs` is append-only; `attempt_answers` are frozen once the attempt closes.
- Regrade/override requires a reason, uses optimistic locking on `results.version`, and writes the audit entry in the same transaction ([results.service.ts](apps/api/src/modules/results/results.service.ts)).
- Each result carries `HMAC_SHA256(secret, attempt|score|max|sha256(answers))`; an hourly job and the admin "Verify" button detect rows edited outside the app.
- Question **versions** are immutable; publishing freezes fixed questions and a snapshot pool for random sections, so editing a question never changes past or running exams.
- Optional least-privilege DB role: [scripts/db-hardening.sql](scripts/db-hardening.sql).

## Recovery after connection failure
Answers are queued per question with increasing `seq`, persisted to `localStorage`, retried with
exponential backoff and re-sent on reconnect ([autosaveQueue.ts](apps/web/src/features/attempt/autosaveQueue.ts)).
On reload the page fetches the attempt (questions in the stored order, saved answers, deadline,
server time) and merges local drafts that are newer than the server copy. The timer keeps running
while offline; if time runs out, only answers that reached the server before deadline + grace count.

## Deployment
- Images: `apps/api/Dockerfile` (API and worker, non-root) and `apps/web/Dockerfile` (static files on unprivileged nginx).
- Single VPS: [docker-compose.prod.yml](docker-compose.prod.yml) + [Caddyfile](Caddyfile) (automatic HTTPS, `/api/*` → API replicas, migrations run as a one-shot service before the API starts).
- CI ([ci.yml](.github/workflows/ci.yml)): typecheck, lint, unit + integration (Postgres service), web build, Playwright E2E.
- CD ([deploy.yml](.github/workflows/deploy.yml)): every push to `main` or tag `v*` runs CI first, then pushes `exam-api` / `exam-web` images to GHCR. The SSH roll-out ([scripts/deploy.sh](scripts/deploy.sh), rolls back if `/api/health` fails) is off until you configure a server:
  1. Prepare a VPS with Docker, create `/opt/exam/.env.production` from [.env.production.example](.env.production.example), and point your domain at it.
  2. In the GitHub repo settings → Secrets and variables → Actions, add secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` and variables `DOMAIN` and `DEPLOY_ENABLED=true`.
  3. Create environments `staging` and `production` (add required reviewers on `production`). `main` deploys to staging; tags `v*` deploy to production.
- Backups: [scripts/backup.sh](scripts/backup.sh) (daily `pg_dump`), [scripts/restore.sh](scripts/restore.sh) (restore drill into a scratch database).
- Environment variables: [.env.production.example](.env.production.example).

## Differences from the plan
- One generic append-only `audit_logs` table (results, attempts, exams, users) instead of `result_audit_logs`.
- Release state is derived from `exams.results_release_at` (and "Release now") rather than a per-result `is_released` flag.
- Added `exam_pool_items`: random-draw candidates are frozen at publish time, and pools are made disjoint so every draw is feasible.
- Multi-device policy: resuming on another device is allowed (plan option a); `client_session_id` is recorded but not enforced.
- Integration tests run `prisma migrate deploy` on a fresh database (Testcontainers or a CI service container) and truncate between tests.
- Export is CSV (UTF-8 BOM, Excel-compatible); no native `.xlsx`.
- Not built yet (plan §5.3 / phase 9 extensions): essay questions and manual marking, proctoring signals, email notifications, WebSocket live monitoring, practice mode, i18n, OCR import, Sentry and Grafana dashboards (Prometheus metrics are exposed).
