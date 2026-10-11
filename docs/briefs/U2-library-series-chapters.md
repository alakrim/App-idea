# Brief U2: Library, Series and Chapters (feature UI)

**Type**: implementation (feature UI). Read `CLAUDE.md`, `docs/CONVENTIONS.md`, **`docs/specs/design-system.md`** (signature moments), the "UI review notes" section of `docs/STATE.md`, `docs/specs/domain.md`, and the existing `src/ui/**`, `src/db/hooks.ts`, `src/db/repos/*`, `src/services/storage.ts` and **`src/features/pipeline/facade.ts`** (the contract you code against; do not modify it).

## Goal
The heart of the app: a beautiful bookshelf, series pages, adding chapters from a URL, PDF or pasted text with a **preview and cost estimate before spending**, and live per-chapter processing progress.

## Scope
1. **Fake facade** (`src/features/pipeline/fake-facade.ts`): `createFakePipeline(opts)` implementing `PipelineFacade` with a scripted, timer-driven progress simulation, for tests and the dev gallery. Wrap the app in `PipelineContext.Provider` from a `src/features/pipeline/pipeline-provider.tsx` that uses a factory you can swap. **For now it provides the fake**; brief P2 replaces it with the real one. Make the swap one line.
2. **Library tab** (`app/(tabs)/index.tsx` + `src/features/library/*`):
   - A 2-column grid of series cards (`CoverImage` 2:3, title, "12 chapters · 4 h 20 m", a progress hairline in amber for listening progress).
   - Sort: Recent / Title. Long-press for a context menu sheet (Edit, Delete with confirm).
   - "Continue listening" hero card at the top for the most recently played chapter (read via `positionRepo`; hide it if there is none).
   - The empty state stays as designed.
   - FlashList is not installed, so use `FlatList` with `numColumns` and memoized items.
3. **New/Edit series** (`app/series/new.tsx`, `app/series/[seriesId]/edit.tsx`):
   - Name, a **cover picker** fixed per the UI review (a 2:3 card about 168 pt wide, "Add cover" overlay, `expo-image-picker` with `allowsEditing` and `aspect [2,3]`).
   - Copy the picked image into `covers/` via storage and compute `coverTint` (the average color of a downscaled image: use `expo-image-manipulator` if installed, otherwise skip the tint with a neutral fallback and report).
   - Optional source/target language (language list shared with settings if U1 has made it. Otherwise make `src/features/shared/languages.ts` and report it so the architect can dedupe).
   - Validation and keyboard handling (KeyboardAvoidingView). The create button is disabled until a name is entered.
4. **Series screen** (`app/series/[seriesId].tsx` + `src/features/series/*`):
   - A header with the cover, the title and a **gradient tinted by `coverTint`**. A collapsing large header (Reanimated scroll handler).
   - Actions: Play/Continue (primary, amber), Add chapter, the language pair badge ("中文 → Italiano"), and a menu (Edit, Delete).
   - **Chapter list** with number, title, duration or state, and a **stage stepper** (Extract → Clean → Analyze → Translate → Narrate) with a ProgressRing while processing.
     - Subscribe via `usePipeline().subscribe`.
     - Failed rows show the error message plus Retry. A scanned-PDF failure shows an "Use OCR (≈ $X)" button with confirmation.
     - Swipe or long-press actions: Delete, Re-generate audio, Move up/down (reorder via `chapterRepo` fractional order).
   - The empty state invites "Add your first chapter".
5. **Add chapter** (`app/chapter/new.tsx`, modal): a segmented control with **Link / PDF / Text**.
   - **Link**: a URL field (paste-from-clipboard chip when the clipboard has a URL, via `expo-clipboard`), then debounced `previewUrl`. Show the preview card (title, excerpt in Literata, word count, detected language, and a quality badge: "Clean" / "AI cleanup" / "Needs page render") with skeletons while loading.
   - **PDF**: `expo-document-picker` (`application/pdf`), showing the file name + size. The PDF text preview happens during processing, so show an informational note.
   - **Text**: a multiline paste box.
   - A title field (prefilled from the preview).
   - The **cost estimate card** (`estimate()` based on chars and the series languages + settings) shows "≈ $0.04 (0.03–0.06)" with an expandable per-stage breakdown.
   - The primary button "Create & process" runs `createChapter` then `enqueue`, then routes back to the series with the new row animating in.
   - Handle errors inline: invalid URL, fetch failure (offline), and an empty extraction.
6. **Chapter screen** (`app/chapter/[chapterId].tsx`):
   - Title, series, status, a detailed stage list with costs, and a **reading view** of the processed text (sentences from `textRepo`) in Literata with paragraph spacing.
   - When translated, a toggle for "Translation / Original / Both (bilingual: translation with the original in `textMuted` below each sentence)".
   - An "Ambience" section listing the cues: category icon + human label + sentence range + reason. Each has a toggle (enabled) persisted via a small `cueRepo.setEnabled`. You may add `src/db/repos/cue-repo.ts` + test.
   - A Play button (call `usePlayer` if `src/features/player/player-store.ts` exports a usable action; otherwise route to `/player?chapterId=`).
7. **Share intent**: not installed. Do not implement. Note it.
8. **Fix the UI-review items in your area**: the new-series cover size and the player empty state. (`app/player.tsx` is shared with A2, so **don't touch it**; just report.)
9. **Tests**:
   - library grid render with data
   - series create validation
   - the add-chapter Link flow with the fake facade (preview → estimate → create → enqueue)
   - PDF selection (mock the picker)
   - stage stepper states (pending/running/failed/done)
   - retry/OCR confirmation
   - bilingual toggle rendering
   - cue toggle persistence

## Constraints
- Do not run `npm install`. Do not commit. Check whether `expo-image-manipulator` is in package.json before using it.
- Concurrency: U1 owns the settings/onboarding files plus `src/ui/{slider,screen,tokens}.tsx`. A2 owns `src/audio/**` and `src/features/player/**`. P1 owns `src/core/{pipeline,llm,analysis,translate}`. You own `app/(tabs)/index.tsx`, `app/series/**`, `app/chapter/**`, `src/features/{library,series,chapter,pipeline (except facade.ts),shared}/**` and `src/db/repos/cue-repo.ts`. You may wrap the provider in `app/_layout.tsx` with a minimal edit (add `<PipelineProvider>` inside `OpenRouterProvider`), and report it.

## Acceptance
`npm run typecheck`, `npm run lint` and `npm test` pass for your files, and `npm run bundle:check` passes (paste the tails). Visual check: export web (`npx expo export --platform web --output-dir /tmp/web-u2`) and capture Playwright screenshots (see the script at `/tmp/claude-0/-home-user-App-idea/afe9cb94-dd9c-5941-9d44-dde24bca9e56/scratchpad/shot.mjs`) of: the library with data, the series screen (processing + ready rows), add chapter (Link with preview + estimate) and the chapter reading view in bilingual mode, in dark + light. SQLite won't run on web, so render populated states through the dev gallery (`app/dev/gallery.tsx`, add a "Screens" section with fake data) if needed. Save the shots to `.../scratchpad/u2-shots/` and list them.
