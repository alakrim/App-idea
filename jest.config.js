/** @type {import('jest').Config} */
const moduleNameMapper = { '^@/(.*)$': '<rootDir>/src/$1' };

module.exports = {
  projects: [
    {
      displayName: 'core',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/core/**/*.test.ts'],
      moduleNameMapper,
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          { tsconfig: { module: 'commonjs', rootDir: '.', isolatedModules: true } },
        ],
      },
    },
    {
      displayName: 'app',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/src/**/*.test.[jt]s?(x)'],
      testPathIgnorePatterns: ['/node_modules/', '<rootDir>/src/core/'],
      moduleNameMapper,
    },
  ],
};
