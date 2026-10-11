# Brief U3: Player experience (full player, mini player, synced text)

**Type**: implementation (feature UI + playback wiring). Read `CLAUDE.md`, `docs/CONVENTIONS.md`, **`docs/specs/design-system.md`** (full player and mini player signature moments), the UI review notes in `docs/STATE.md`, ADR-0002/0005, and the existing `src/audio/engine.ts`, `src/audio/native-engine.ts`, `src/audio/fake-engine.ts`, `src/features/player/player-store.ts`, `src/features/player/mini-player.tsx`, `src/core/playback/*`, `src/db/repos/*` and `src/db/hooks.ts`.

## Goal
The listening experience, which is what the product is judged on. It has to feel like a top-tier audiobook player and add the language-learning superpowers.

## Scope
1. **Playback data** (`src/db/repos/playback-repo.ts` + test): read-only queries for `getChapterForPlayback(chapterId)`, returning the chapter, series (title, cover, tint), audio segments (uri, durationMs, sentenceOffsetsMs, sentence ranges), enabled cues, and the sentences (original + translated). Also add `audio-segment-repo.ts` with `insert`, `listByChapter`, `deleteFrom(chapterId, idx)` and tests. The pipeline (P2) will use it.
2. **Playback controller** (`src/features/player/playback-controller.ts`):
   - `playChapter(chapterId, {fromSentence?})` loads the data, builds the engine `load(...)` input and resumes from the saved `current` position if the chapter matches.
   - Auto-advance to the next ready chapter at the end.
   - Progressive playback: subscribe to pipeline progress if the chapter is still narrating (`usePipeline().subscribe`, `readySegments`) and call `appendSegments`.
   - Wire `savePosition` to `positionRepo.record`.
   - Inject the engine (native in the app, fake in tests/web) through a `PlayerEngineProvider` in `src/features/player/`. Web and Jest use the fake.
3. **Full player** (`app/player.tsx`):
   - A blurred cover backdrop (`expo-blur` over the cover image) with a tint gradient.
   - Large cover with a subtle scale on play/pause.
   - Title, series and chapter name.
   - A **scrubber** (a custom Reanimated/gesture scrubber over the chapter timeline with elapsed / −remaining labels and the chapter's sentence ticks too faint to distract).
   - Transport: −15 s, play/pause (large, amber), +30 s, and previous/next sentence (long-press).
   - Speed (a sheet with 0.5–2.0 in 0.05 steps plus presets), sleep timer (sheet: Off, 5, 15, 30, 45, 60 min, End of chapter, with a visible countdown chip), and **ambience chip** (shows the live bed names, e.g. "Rain · Tavern"; tap for a sheet with the master on/off and the level slider if `src/ui/slider.tsx` exists, otherwise a SegmentedControl Subtle/Normal/Present).
   - **Synced text pane**: pull up from the bottom (gesture sheet) to show the chapter text with the current sentence highlighted (`accentSoft` background, smooth transition) and auto-scroll that pauses for 5 s after the user scrolls manually. Tap a sentence to seek there. In **bilingual mode** (toggle in the pane header), show each sentence's original under the translation in `textMuted`.
   - **Learner actions**: long-press a sentence for "Repeat sentence" (an A-B loop on that sentence until it is tapped off), "Copy", and "Save to Vocab" (call an injected `onSaveVocab(sentenceRef, text)`; U4 implements the Vocab store, so use a context `VocabActionsContext` with a no-op default and report it).
   - Empty state (fix from the UI review): with nothing loaded, show `EmptyState` ("Nothing playing", CTA to the Library). No fake cover.
4. **Mini player** (`src/features/player/mini-player.tsx`): wire it to the store. Cover, title, the current sentence as a one-line marquee-free truncation, play/pause, and an amber progress hairline. Tap or swipe up opens `/player`. It shows above the tab bar on all tabs when something is loaded.
5. **Chapter entry points**: export `usePlayChapter()` for other features (the Series and Chapter screens can call it; U2 may already route to `/player?chapterId=`, so support that param too).
6. **Haptics and accessibility**: a seek haptic tick per 15 s step while scrubbing. The scrubber is `adjustable` with increment/decrement. Every control has a label. Respect reduce-motion.
7. **Tests**:
   - controller (load/resume/auto-advance/progressive append, using the fake engine)
   - full player renders the loaded state and the empty state
   - scrubber accessibility actions
   - synced text highlight follows the sentence and tap-to-seek calls the engine
   - bilingual toggle
   - A-B repeat loops a sentence
   - sleep timer chip countdown
   - mini player visibility

## Constraints
- Do not run `npm install`. Do not commit.
- Concurrency: U1 (settings/onboarding, `src/ui/{slider,screen,tokens}`), U2 (library/series/chapter, `src/features/pipeline/*` except facade, `src/db/repos/cue-repo.ts`, `app/_layout.tsx` provider line), U4 (`app/(tabs)/{ask,vocab}.tsx`, `src/features/{ask,vocab}`, `src/db/repos/{qa,vocab,memory}-repo.ts`) and P1 (`src/core/{pipeline,llm,analysis,translate}`).
- You own `app/player.tsx`, `src/features/player/**` (keep `player-store.ts`'s public API stable; extend it if needed), and `src/db/repos/{playback,audio-segment}-repo.ts`. Minimal edits to `src/audio/**` are allowed only if you find a real bug (report it). If you need to mount `PlayerEngineProvider` in `app/_layout.tsx`, make a one-line edit and report it.

## Acceptance
`npm run typecheck`, `npm run lint` and `npm test` pass for your files, and `npm run bundle:check` passes (paste the tails). Visual check: a web export plus Playwright screenshots (script at `/tmp/claude-0/-home-user-App-idea/afe9cb94-dd9c-5941-9d44-dde24bca9e56/scratchpad/shot.mjs`) of the player with a loaded fake chapter (text pane collapsed and expanded, bilingual on), the mini player over the Library, the sleep/speed sheets and the empty state, in dark + light. Use the dev gallery with the fake engine if needed. Save them to `.../scratchpad/u3-shots/`.
