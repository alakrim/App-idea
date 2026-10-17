# src/features

One folder per feature: its screens, hooks and logic. Routes in `app/` compose these. Code shared between features lives in `shared/`, and the design system is in `src/ui`.

**Layout**
- `library/`: library list, continue card, series cards. `useLibrary()`.
- `series/`: series form, cover picker, chapter rows, series screen and its service.
- `chapter/`: chapter screen, reading view, stage stepper, add-chapter form (map: `chapter/README.md`).
- `player/`: full and mini player, transport, scrubber, synced text, playback controller (map: `player/README.md`).
- `settings/`: settings pages, API key, model and narrator pickers, usage, onboarding (map: `settings/README.md`).
- `ask/`: spoiler-safe Q&A about earlier chapters: service, answer card, citations, keywords.
- `vocab/`: saved words, flashcard review, vocab actions and screen.
- `pipeline/`: `PipelineProvider`, the `PipelineFacade` type, live chapter progress, fake pipeline for tests and the gallery.
- `diagnostics/`: device, audio, storage and pipeline checks behind the diagnostics screen.
- `shared/`: formatting, languages, colour helpers, confirm and series action sheets.

**Entry points**
- `pipeline/facade.ts`: `PipelineFacade`, the only pipeline surface feature UI uses.
- `player/player-provider.tsx`: `usePlayback()`, `usePlayerState()`, `usePlaybackContent()`.
- `settings/settings-store.ts`: `useSettings()`.
- `library/use-library.ts`: `useLibrary()`.
- `chapter/chapter-screen.tsx`: `ChapterScreen`, the chapter route's target.

**Gotchas**
- Call zustand stores through `useStore(store, selector)` or a `useX` wrapper, never as a plain function (React Compiler rule, see CONVENTIONS).
- Start and watch chapter processing through the facade (`pipeline/facade.ts`). Only `pipeline/pipeline-provider.tsx` builds the runtime.

**Tests**: `*.test.ts(x)` beside the code. Screen tests and the harness live in `src/__tests__/`. Run with `npm test`, or `npm test -- src/features/<name>`.

**Import rules**

- May import from `src/ui`, `src/audio`, `src/services`, `src/db` and `src/core`.
- Never import from `app/` (routes compose features; features do not know about routes).
- Features do not import each other directly. Share through `src/ui` or `src/core`.
