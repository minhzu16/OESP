/**
 * Typed, validated configuration read once from the environment.
 * Fails fast on boot when a required secret is missing or too short.
 */
export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  databaseUrl: string;
  redisUrl: string | null;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessTtlSeconds: number;
  refreshTtlDays: number;
  resultHmacSecret: string;
  submissionGraceSeconds: number;
  expirySweepIntervalSeconds: number;
  corsOrigins: string[];
  throttleLimitPerMinute: number;
  authThrottleLimitPerMinute: number;
  metricsToken: string | null;
  logLevel: string;
}

let cached: AppConfig | null = null;

/** Loads ./.env when present (local development). Real env vars always take precedence. */
export function loadDotEnv(): void {
  try {
    process.loadEnvFile();
  } catch {
    /* no .env file — production uses real environment variables */
  }
}

function str(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') throw new Error(`Missing required env var ${name}`);
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Env var ${name} must be a non-negative integer`);
  return n;
}

function secret(name: string): string {
  const value = str(name);
  if (value.length < 32) throw new Error(`Env var ${name} must be at least 32 characters`);
  return value;
}

export function getConfig(): AppConfig {
  if (cached) return cached;
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  cached = {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: int('PORT', 4000),
    databaseUrl: str('DATABASE_URL'),
    redisUrl: process.env.REDIS_URL ? process.env.REDIS_URL : null,
    jwtAccessSecret: secret('JWT_ACCESS_SECRET'),
    jwtRefreshSecret: secret('JWT_REFRESH_SECRET'),
    jwtAccessTtlSeconds: int('JWT_ACCESS_TTL_SECONDS', 900),
    refreshTtlDays: int('REFRESH_TTL_DAYS', 7),
    resultHmacSecret: secret('RESULT_HMAC_SECRET'),
    submissionGraceSeconds: int('SUBMISSION_GRACE_SECONDS', 10),
    expirySweepIntervalSeconds: Math.max(1, int('EXPIRY_SWEEP_INTERVAL_SECONDS', 15)),
    corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    throttleLimitPerMinute: int('THROTTLE_LIMIT_PER_MINUTE', 600),
    authThrottleLimitPerMinute: int('AUTH_THROTTLE_LIMIT_PER_MINUTE', 20),
    metricsToken: process.env.METRICS_TOKEN ? process.env.METRICS_TOKEN : null,
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
  return cached;
}

/** Tests mutate env between suites. */
export function resetConfig(): void {
  cached = null;
}
