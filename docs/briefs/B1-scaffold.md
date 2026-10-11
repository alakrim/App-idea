# Brief B1: App scaffold and tooling

**Type**: implementation. Read `CLAUDE.md` and `docs/CONVENTIONS.md` first.

## Goal
Create the Expo + TypeScript app at the **repo root** (`/home/user/App-idea`, which already contains `docs/`, `CLAUDE.md`, `.gitignore` and `.claude/`; keep them intact) with production-grade tooling. Later tasks build on this, so get it right.

## Requirements
1. Expo, latest stable SDK (check with `npm view expo version`). Use the `expo-router` template with typed routes enabled and the New Architecture enabled. Package name `lectio`, Android package `app.lectio`, iOS bundle id `app.lectio`, scheme `lectio`, `userInterfaceStyle: "automatic"`. Use `app.config.ts` (typed), not `app.json`.
   - Tip: scaffold into a temp dir with `npx create-expo-app@latest` and move the files in, then delete the template's demo screens/components and replace them with the minimal shell below.
2. TypeScript: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, plus the path alias `@/*` → `src/*` (wired for both Metro/Babel and Jest).
3. Lint/format: ESLint flat config (`eslint-config-expo` + `@typescript-eslint` rules, `import/order` or equivalent) and Prettier (`singleQuote: true`, `printWidth: 100`). Add a rule that forbids `src/core/**` from importing `react`, `react-native`, `expo*` or anything outside `src/core` (`no-restricted-imports` with overrides).
4. Jest with **two projects**:
   - `core`: `testEnvironment: node`, `ts-jest` or `babel-jest`, matching `src/core/**/*.test.ts`
   - `app`: `jest-expo` preset, matching other `*.test.ts(x)`, with `@testing-library/react-native` set up
5. npm scripts: `start`, `android`, `ios`, `typecheck` (`tsc --noEmit`), `lint`, `format`, `test`, `test:core`, `bundle:check` (`expo export --platform android --output-dir dist/check` then delete `dist/check`), and `verify` (= typecheck && lint && test && bundle:check).
6. Folder layout exactly as in `docs/CONVENTIONS.md`. Create the directories with a short `README.md` in each `src/*` top-level folder stating its purpose and import rules.
7. A minimal `app/_layout.tsx` + `app/index.tsx` that render "Lectio" so the bundle builds. (A later brief builds the real design system and navigation; do not do it here.)
8. One sample core test (`src/core/text/normalize.ts` with `normalizeWhitespace(s: string): string`, which collapses runs of whitespace and trims, CJK-safe) and one sample app test rendering the index screen.
9. `.env.example` (empty placeholder comment only, because the API key is user-entered at runtime and never in env).
10. `.nvmrc` with `22`.

## Acceptance (paste the real output tails)
- `npm run typecheck` passes
- `npm run lint` passes with zero warnings
- `npm test` passes (both projects run)
- `npm run bundle:check` succeeds (bundles Android JS without an Android SDK)
- `git status` shows no `node_modules`, `dist` or other junk tracked

## Out of scope
UI design, DB, audio and services. Do not install extra libraries beyond what the template plus tooling need.

Do not commit. Update `docs/STATE.md`: add a line under "Notes" listing the exact Expo SDK, React Native and React versions installed.
