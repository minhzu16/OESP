# PJ4 — Online Examination & Result System (OESP)

Monorepo (`pnpm` workspaces): NestJS API (`apps/api`), React Vite PWA (`apps/web`), shared contracts (`packages/shared`).

## Common Commands
- Install: `pnpm install --frozen-lockfile`
- Typecheck all: `pnpm -r typecheck`
- Lint all: `pnpm -r lint`
- Build all: `pnpm -r build`
- API unit tests (with coverage): `pnpm --filter @exam/api test:unit`
- Web unit tests (with coverage): `pnpm --filter @exam/web test`
- E2E tests (Playwright): `pnpm test:e2e`
