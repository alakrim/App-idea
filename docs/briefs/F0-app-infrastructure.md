# Brief F0: App infrastructure (providers, persistence, secrets)

**Type**: implementation. Read `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/ARCHITECTURE.md`, `docs/specs/domain.md`, `docs/decisions/0002…` and `0003…`, plus the existing code in `src/db/**`, `src/services/openrouter/index.ts`, `src/ui/theme.tsx` and `app/_layout.tsx`.

## Goal
Wire the foundations so feature screens can use the DB, settings, the API key and the OpenRouter client through clean hooks. **No feature UI in this brief.**

## Scope
1. **Secrets** (`src/services/secrets.ts`): `getApiKey()`, `setApiKey(key)` and `clearApiKey()` over `expo-secure-store` with `keychainAccessible: AFTER_FIRST_UNLOCK`. Basic format check (`sk-or-` prefix plus a length sanity check) before saving. The key is never logged. Also add a `useApiKeyStatus()` hook: `'unknown'|'missing'|'present'`.
2. **Settings** (`src/db/repos/settings-repo.ts` + `src/features/settings/settings-store.ts`):
   - Typed settings with zod and defaults:
     - `theme: 'system'|'dark'|'light'`
     - `uiLanguage`
     - `defaultTargetLang: Lang|null`
     - `translationModel`, `analysisModel` (default a cheap structured-output model id; use `google/gemini-2.5-flash-lite`'s successor if R1 flags expiry, so pick from R1's recommendations and put the defaults in one `src/core/defaults.ts`), `cleanupModel`
     - `narration: {provider, model, voice, style, speed}`
     - `ambience: {enabled, levelDb: -22, duckingDb: 8}`
     - `reading: {fontScale, showOriginal}`
     - `onboardingDone`, `contentNoticeAccepted`
   - `getSettings`/`patchSettings` are persisted in the `settings` table.
   - A `useSettings()` hook (zustand store hydrated from the DB at boot, with writes going through to the DB).
3. **DB provider** (`src/app-shell/db-provider.tsx`): open the DB, run `useLectioMigrations()` and expose `useDb()`. While migrating, keep the splash screen up. On failure, render a designed fatal `ErrorState` ("We couldn't open your library", with a Retry button and a "Copy details" button).
4. **Live queries**: a `useLiveQuery`-based hook layer (`src/db/hooks.ts`) for the lists the UI will need: `useSeriesList()`, `useSeries(id)`, `useChapters(seriesId)`, `useChapter(id)`, `useJobs(chapterId)`. Use drizzle `useLiveQuery` from `drizzle-orm/expo-sqlite` where it fits. Repos stay the source of the SQL.
5. **OpenRouter provider** (`src/app-shell/openrouter-provider.tsx`): a singleton client with `getApiKey` from secrets, `appUrl: 'https://lectio.app'`, `appTitle: 'Lectio'`, and `useOpenRouter()`. Persist the model catalog cache via `serialize`/`hydrate` into a file under `Paths.cache` (expo-file-system new API), rehydrated at boot.
6. **File storage** (`src/services/storage.ts`): directory helpers under `Paths.document`: `covers/`, `sources/<chapterId>/` (raw html/pdf), `audio/<chapterId>/`, `previews/`. Plus `writeBytes`, `readBytes`, `deleteChapterFiles`, `freeSpaceBytes()` and a `bytesUsedByLibrary()` (sum per dir).
7. **App shell** (`app/_layout.tsx`): compose `ThemeProvider` (driven by `settings.theme`), `DbProvider`, `OpenRouterProvider`, `ToastProvider` and `GestureHandlerRootView` in the right order, plus an **error boundary** (expo-router `ErrorBoundary` export) using `ErrorState`. Keep fonts and splash handling from B2.
8. **Integration task from I1**: if `src/bootstrap.ts` or `src/services/extraction/index.ts` exists, import it from the shell as instructed in that file's header comment so the extract stack is in the bundle.
9. **Tests**: settings-repo (defaults, patching, invalid stored JSON resets to defaults with a warning), secrets (mock secure-store, format validation, never-logged), storage path helpers (mock fs), and a provider render test (migrations loading → children; failure → ErrorState).

## Constraints
- Do not run `npm install` (every dependency you need is installed). Do not commit.
- Another worker is editing `src/core/translate/**`, another `src/audio/**` + `src/core/playback/**`, another `scripts/sounds/**` + `assets/ambience/**`. Don't touch those.

## Acceptance
`npm run verify` passes (paste the tail). Report the provider tree and the public hooks.
