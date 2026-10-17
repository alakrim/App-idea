# Brief F2: "Listen now" while the chapter is still being made (player UX)

**Type**: implementation (core ramp tweak + chapter screen + player UI).

**Read first**: `CLAUDE.md`, `docs/CONVENTIONS.md` (**React Compiler** and **Worklets** rules; `npm run worklet:check`), **ADR-0008** (section 6 is this brief), `docs/briefs/F1-handoff.md` (what F1 built), `src/services/pipeline/progress.ts` (the new fields: `playable`, `etaMs`, `narratedMs`, `estimatedTotalMs`, and the `analysisReady` and `playable` events), `src/features/pipeline/*`, `src/features/chapter/{chapter-view,chapter-screen,chapter-status,stage-stepper,ambience-list}.tsx?`, `src/features/player/{playback-controller,player-provider,player-store,scrubber,full-player,mini-player,transport}.tsx?` and `src/core/text/chunk.ts`.

## Why
F1 made audio available about 12 s after the start, instead of after the whole chapter. But the chapter screen still disables **Play** until the chapter is `ready` (`chapter-view.tsx`, `disabled={state !== 'ready'}`), so the user still waits for everything. The user's request: "start listening to the first part while the rest loads".

## Scope
1. **CJK-aware ramp** (F1 open issue 1):
   - The first segments ramp by **estimated seconds of speech** (`estimateSpeechSeconds` from `core/text/speech-rate`), not by characters: about 12 s for the first segment, about 25 s for the second, then the narrator's normal max chars.
   - Keep the plan deterministic and prefix-stable (F1's invariant), and update the tests: Latin, Han and Japanese.
2. **Chapter screen**:
   - Play is enabled as soon as `progress.playable` is true. While processing, the button label is **"Listen now"**, with a small subtitle such as "12 min ready · about 3 min left", built from `narratedMs`, `estimatedTotalMs` and `etaMs`.
   - Without an ETA yet, show "Preparing the first minutes…".
   - Once ready, it shows the normal Play.
3. **Player while generating**:
   - **Buffer band**: the scrubber shows the generated portion (`narratedMs` / `estimatedTotalMs`) as a subtle band behind the progress, like a video buffer. Seeking beyond it clamps to the end of the band, with a light haptic.
   - **Catching up**: if playback reaches the end of the generated audio while the chapter is still narrating, show a calm "Narrating ahead…" state in the transport: a small animated indicator and no error tone.
     - Ambience keeps playing, the voice resumes automatically when the next segment lands, and there is no gap jump.
     - Check how `playback-controller.ts` appends segments today, and make the wait-and-resume path explicit and tested.
   - **Ambience arrives late**: on `analysisReady`, the player reloads the cues for the playing chapter and starts any bed whose range covers the current sentence (with its fade-in). Test it.
   - The mini player shows the same "Narrating ahead…" state.
4. **Completion feedback**: when a chapter becomes playable while the app is in the foreground, a toast says "Ready to listen: <chapter title>", with an action "Listen", once per run.
5. **Tests**: the ramp in seconds, the Listen-now enable/labels (all states), the buffer band math and clamped seek, catch-up then auto-resume (with fake segment arrival), late cues starting mid-range, the playable toast once, and accessibility labels on the new elements.

## Constraints
- No new dependencies, no real API calls. Follow the design tokens, motion with reduce-motion support, haptics, and 44 pt touch targets.
- Don't touch `src/core/pipeline/{queue,runner}.ts`, `modules/**`, `plugins/**`, `app.config.ts`, `assets/**` or `src/core/analysis/**`.
- Work in the worktree you are given. If `node_modules` is missing, `ln -s /home/user/App-idea/node_modules node_modules`. **Commit** on your branch when `npm run verify` is green, with these trailer lines: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_016sqBEw3paK5QXmP6QkprQ9`.
- Context budget: around 220k tokens (about 150 tool calls), stop at a committed checkpoint, write `docs/briefs/F2-handoff.md`, and report.
- Update `docs/STATE.md` only by adding a short "F2" line under "Work in flight".
