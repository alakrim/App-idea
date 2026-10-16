# src/features/player

Purpose: the full and mini player, transport, scrubbing, synced text and ambience controls, all driven by the playback controller.

**Layout**
- Logic: `playback-controller.ts`, `playback-data.ts`, `player-store.ts`, `player-engine.ts` (lazy native engine), `sentence-range.ts`, `follow-pause.ts`, `format.ts`.
- Provider: `player-provider.tsx` (`PlayerEngineProvider`, `PlaybackProvider`, the hooks).
- Screens: `full-player.tsx`, `mini-player.tsx`, `synced-text-pane.tsx`, `transport.tsx`, `scrubber.tsx` with `scrub.ts`, `speed-sheet.tsx`, `sleep-timer.tsx`, `ambience-sheet.tsx`, `sentence-sheet.tsx`.
- Look: `layout.ts` (`PLAYER` geometry), `motion.ts`, `backdrop.tsx`, `chip.tsx`, `ambience-names.ts`.

**Entry points:** `player-provider.tsx` `usePlayback()`, `usePlayerState()`, `usePlaybackContent()`; `playback-controller.ts` `createPlaybackController()`; `full-player.tsx` `FullPlayer`.

**Gotchas:** `usePlayerState` and `usePlaybackContent` call zustand through `useStore` (React Compiler rule). Worklets in `scrub.ts` must never call plain JS: that crashed the scrubber on device (2026-10-11).

**Tests:** `*.test.ts(x)` beside each file, fixtures in `__fixtures__/`. Run `npm test -- src/features/player`.
