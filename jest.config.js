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
      moduleNameMapper: {
        ...moduleNameMapper,
        // defuddle/node has only an `import` export condition. Jest needs its CJS build.
        '^defuddle/node$': '<rootDir>/node_modules/defuddle/dist/node.js',
      },
      transform: {
        ...tsTransform,
        // linkedom's dependency tree (css-select 7, boolbase 2, entities 8, ...) is ESM-only.
        '^.+\\.js$': [
          'babel-jest',
          {
            babelrc: false,
            configFile: false,
            plugins: ['@babel/plugin-transform-modules-commonjs'],
          },
        ],
      },
      transformIgnorePatterns: [
        '/node_modules/(?!(?:linkedom|css-select|boolbase|css-what|domhandler|domelementtype|domutils|dom-serializer|entities|nth-check|html-escaper|htmlparser2|uhyphen)/)',
      ],
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
