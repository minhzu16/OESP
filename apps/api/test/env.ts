// Runs in every integration test worker before modules load.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789-0123456789';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789-012345678';
process.env.RESULT_HMAC_SECRET ??= 'test-result-hmac-secret-0123456789-01234';
process.env.SUBMISSION_GRACE_SECONDS = '2';
process.env.THROTTLE_LIMIT_PER_MINUTE = '100000';
process.env.AUTH_THROTTLE_LIMIT_PER_MINUTE = '100000';
process.env.REDIS_URL = '';
process.env.DATABASE_URL = process.env.INTEGRATION_DATABASE_URL;
