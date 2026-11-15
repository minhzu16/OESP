---
name: node-optimization
description: Production-grade Node.js & TypeScript performance and reliability optimization skill based on Matteo Collina's best practices (mcollina/skills). Covers zero-overhead structured logging (Pino), resilient process lifecycle (close-with-grace), typed error hierarchies with cause preservation, and non-blocking asynchronous database operations.
---

# Node.js & TypeScript Backend Optimization Skill

This skill incorporates the authoritative production guidelines from **Matteo Collina** (Node.js Technical Steering Committee Member, creator of Fastify, Pino, and Undici) from the [mcollina/skills](https://github.com/mcollina/skills) repository.

## Core Optimization Pillars

### 1. High-Throughput Structured Logging (Pino)
- **Principle**: `console.log` is synchronous and blocks the Node.js event loop when writing to `stdout` in high-load scenarios.
- **Rule**: Always use [pino](https://github.com/pinojs/pino) for asynchronous, structured JSON logging.
- **Implementation**:
  - Use log levels appropriately: `debug`, `info`, `warn`, `error`, `fatal`.
  - Pass structured objects as the first argument (`logger.info({ userId, durationMs }, 'User processed')`).
  - Use `pino-pretty` in local development environments and raw JSON in production for fast ingestion by ELK / Datadog / CloudWatch.

### 2. Resilient Lifecycle & Graceful Shutdown (`close-with-grace`)
- **Principle**: Unhandled process exits drop in-flight HTTP requests, leave open database transactions, and corrupt state.
- **Rule**: Use [close-with-grace](https://github.com/fastify/close-with-grace) to handle `SIGTERM`, `SIGINT`, `uncaughtException`, and `unhandledRejection` unifiedly with a strict timeout.
- **Sequence**:
  1. Stop accepting new HTTP requests (`server.close()`).
  2. Terminate idle keep-alive connections (`server.closeIdleConnections()`).
  3. Stop background workers, cron timers, and active polling loops.
  4. Allow active transactions to finish, then safely drain the database connection pool (`pool.end()`).
  5. Exit with appropriate status code.

### 3. Error Architecture & Error Cause Chains
- **Principle**: Custom error strings or throwing generic errors obscures debugging and leads to unhandled rejections.
- **Rule**:
  - Define custom domain errors subclassing `AppError` with clear machine-readable error codes (`BOOKING_CONFLICT`, `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `RATE_LIMITED`).
  - Always preserve the underlying error cause using Node 16+ Error cause (`new AppError(msg, { cause: err })`).
  - Centralize error handling in Express/Fastify middleware so no error is swallowed or silently ignored.

### 4. Non-Blocking Event Loop & Concurrency
- **Principle**: Keep the event loop latency near zero. Never run CPU-heavy operations (large synchronous crypto, unchunked JSON serialization) on the main thread.
- **Rule**:
  - Use asynchronous crypto algorithms or offload intensive computation to worker pools (e.g., `piscina`).
  - Avoid `async/await` in tight iterations when `Promise.all` or batched processing is viable.

### 5. PostgreSQL Pool & Statement Tuning
- **Principle**: Connection exhaustion and runaway queries can bring down both the API and database.
- **Rule**:
  - Configure pool sizing (`max`, `idleTimeoutMillis`, `connectionTimeoutMillis`).
  - Log slow queries with warnings (`duration > 150ms`).
  - Set `statement_timeout` for transactions to avoid indefinitely held table locks.
