/** @type {import('jest').Config} */
const transform = { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] };

module.exports = {
  // Integration suites share one database, so files run serially.
  maxWorkers: 1,
  testTimeout: 60_000,
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      transform,
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/**/*.int-spec.ts'],
      transform,
      setupFiles: ['<rootDir>/test/env.ts'],
      globalSetup: '<rootDir>/test/global-setup.ts',
      globalTeardown: '<rootDir>/test/global-teardown.ts',
    },
  ],
};
