# syntax=docker/dockerfile:1.7
# Build from the repository root:  docker build -f apps/api/Dockerfile -t exam-api .
# The same image runs the API (default) and the worker (`node dist/worker.js`).

FROM node:22-alpine AS base
RUN apk add --no-cache openssl && corepack enable
WORKDIR /repo

# ── Manifests only, so dependency layers are cached across source changes ──
FROM base AS manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/api/prisma apps/api/prisma
COPY packages/shared/package.json packages/shared/

# ── Build ──
FROM manifests AS build
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @exam/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @exam/shared build && pnpm --filter @exam/api build

# ── Production dependencies only (postinstall runs `prisma generate`) ──
FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @exam/api...

# ── Runtime ──
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /repo /repo
COPY --from=build --chown=node:node /repo/packages/shared/dist /repo/packages/shared/dist
COPY --from=build --chown=node:node /repo/apps/api/dist /repo/apps/api/dist
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "dist/main.js"]
