# Conventions

## Language and tooling
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. `any` is forbidden unless a comment explains why.
- Format with Prettier (default config + `singleQuote: true`, `printWidth: 100`). Lint with ESLint (`eslint-config-expo` + `@typescript-eslint`).
- Validate every external payload at the boundary with **zod**: LLM JSON, OpenRouter responses, DB JSON columns and imported files. Never trust model output.

## Repository layout (app)
```
app/                    expo-router screens (thin: compose features, no business logic)
src/
  core/                 pure TypeScript domain logic, with no React or native imports (unit-testable in Node)
    text/               segmentation, normalization, chunking
    extract/            HTML/PDF extraction + quality scoring
    analysis/           ambience cue + memory schemas, prompts, validators
    pipeline/           job graph, stages, retry/resume, cost estimation
    memory/             spoiler-safe retrieval + Q&A prompt assembly
  services/             adapters to the outside world (OpenRouter client, TTS providers, fs, db)
  db/                   drizzle schema, migrations, repositories
  audio/                playback engine, ambience mixer, media session
  features/<feature>/   UI + hooks per feature (library, series, chapter, player, settings, ask)
  ui/                   design system: tokens, primitives, motion, icons
assets/                 fonts, images, ambience packs
docs/                   protocol docs (see CLAUDE.md)
```
Dependencies flow only one way, `app → features → (ui, audio, services, db) → core`. `core` imports nothing outside `core`.

## Naming
- Files are `kebab-case.ts`. React components are `PascalCase` exports in `kebab-case.tsx` files.
- Types and interfaces are `PascalCase`. Constants are `SCREAMING_SNAKE` only when they are truly global.
- DB tables are `snake_case` plural. Ambience categories are stable `snake_case` ids, and they are never renamed once shipped.

## Testing
- Use Jest (`jest-expo` preset for RN code, and a `node` project for `src/core`).
- Every module in `src/core` has unit tests beside it as `*.test.ts`.
- Mock the network. Tests never hit OpenRouter or any paid API.
- Use fixtures under `src/**/__fixtures__/` (real-world HTML pages, sample PDFs, sample LLM outputs, including malformed ones).

## UI
- Use design tokens only (`src/ui/tokens.ts`), with no magic numbers for color, spacing or radius.
- The app is dark-first and has a light theme. The minimum touch target is 44pt. Every interactive element has an `accessibilityLabel`.
- Every async screen has loading (skeletons, not spinners, where possible), empty and error states.
- Motion runs on Reanimated on the UI thread and respects reduce-motion.
- Copy is short and human. Errors say what happened and what to do next.

## React Compiler rules (it is on: `experiments.reactCompiler`)
- Every hook call must have a `use*` name at the call site. Never call a hook through a variable or property without the `use` prefix (e.g. `content(selector)` on a zustand store). The compiler memoizes it as a plain call and the hook order breaks ("Rendered fewer hooks than expected", which caused a real player crash). For zustand, use `useStore(store, selector)` or a `useX` property.
- `'use no memo'` is forbidden unless an ADR justifies it.

## Worklets (Reanimated 4 / react-native-worklets)
- Code inside `useAnimatedStyle`, `useDerivedValue`, `useAnimatedReaction` and gesture callbacks runs on the UI thread. Every function it calls must be a worklet (`'worklet';` as its first statement), or come from Reanimated/Worklets. To reach JS code, use `runOnJS(fn)(...)`, or `.runOnJS(true)` on a gesture. A plain function call crashes the app on device, and Jest won't notice (Reanimated is stubbed there). This crashed the player's scrubber (2026-10-11).
- Declare worklet helpers **before** the code that uses them: the worklets Babel plugin turns them into constants, which are not hoisted.
- `npm run worklet:check` (part of `verify`) enforces the first rule.

## LLM usage
- Prompts live in `src/core/**/prompts.ts` as versioned constants (`PROMPT_VERSION`). Outputs are stored with that version.
- Request structured output (`json_schema`) whenever the model supports it, and always validate with zod. A failed validation gets one repair retry, then a typed error.
- Every call goes through `services/openrouter` so cost and token accounting is centralized.

## Git
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`). Keep commits small and coherent.
- Only the architect commits and pushes, unless a brief says otherwise.
