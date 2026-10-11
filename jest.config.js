/** @type {import('jest').Config} */
const moduleNameMapper = { '^@/(.*)$': '<rootDir>/src/$1' };
const tsTransform = {
  '^.+\\.ts$': [
    'ts-jest',
    { tsconfig: { module: 'commonjs', rootDir: '.', isolatedModules: true } },
  ],
};

module.exports = {
  projects: [
    {
      displayName: 'core',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/core/**/*.test.ts'],
      moduleNameMapper,
      transform: tsTransform,
    },
    {
      // Pure-TS adapters that run in Node: OpenRouter client, SQLite repos (better-sqlite3).
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/src/services/openrouter/**/*.test.ts',
        '<rootDir>/src/db/**/*.test.ts',
      ],
      moduleNameMapper,
      transform: tsTransform,
    },
    {
      displayName: 'app',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/src/**/*.test.[jt]s?(x)'],
      testPathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/src/core/',
        '<rootDir>/src/services/openrouter/',
        '<rootDir>/src/db/',
      ],
      moduleNameMapper,
    },
  ],
};
