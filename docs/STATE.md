# STATE: source of truth

_Last updated: 2026-10-17 by the architect. Keep this file under about 500 words. History lives in `docs/archive/STATE-history.md` (to 2026-10-16) and `docs/archive/STATE-history-2026-10-17.md` (the 2026-10-17 wave and the merge). Don't read them by default._

## Current phase
**One code line** (`claude/serene-hypatia-73g7qo`). The two lines were unified on 2026-10-17 (brief I3, log in `docs/briefs/I3-resolution-log.md`). `npm run verify` is green with 276 suites and 2,561 tests, and `boot:check`, `sounds:verify` and `contract:check` (31/31) all pass. Now: **debug sweep** (user request). The goal is to find and fix every bug and inefficiency.

## What the build has (APK `lectio-0.1.0-ced9221-arm64.apk`, the only build on `apk-builds`)
- Core loop: URL/PDF/text → extract → clean → analyze → translate → narrate → play, plus ambience, memory Q&A and vocab.
- Background processing: one foreground service (`modules/lectio-background`, dataSync) and a progress notification. Transient failures wait with backoff. N3 connection retirement and the stall watchdog are in. ADR-0007.
- Progressive narration: analysis runs beside translate → narrate, with an adaptive TTS window (starts at 3, at most 6, free narrator 1), a speech-seconds ramp, "Listen now", a buffer band and "Narrating ahead…". ADR-0008.
- The listening model: per-chapter resume, bookmarks and speed per series. The incident-3 audio-focus fix is in, with its regression test mutation-checked.
- Every OpenRouter speech model, newest first (Fish Drama 3). Reliable ambience: analysis prompt v4, a cue cache, a fallback and a cue report. 34 category ambience beds plus 6 base beds.

## Work in flight
- **Cleanup (user instruction):** done here. `apk-builds` holds only `ced9221`, and the local worktrees are removed. **Remote branches `claude/charming-fermat-srbk25`, `claude/vigilant-brahmagupta-mbgfm3` and `claude/test-100-credit-64yv57` could not be deleted from this session** (the proxy refuses ref deletion), so the user deletes them on GitHub after setting the default branch to this one. All three are fully contained here: charming-fermat up to `54b3d2e` is merged, and its later WIP docs are in `docs/archive/`.
- **Debug sweep, phase 1:** the audits in `docs/briefs/Q2-debug-audit.md` (QA-E audio/player/background, QA-F pipeline/data/cost, QA-G UX/a11y/perf), at most 2 workers at once. Then fix waves, P1 first, each with mutation-checked tests. Then one APK and a device checklist.

## Session rules (user)
- At most **2 worker agents at once**. A worker that passes about 220k tokens writes a handoff and stops.
- **No paid API calls** until the user approves a key (asked on 2026-10-17: a small end-to-end test).
- Every APK build runs `contract:check` first (keyless, live).

## Open items to verify on device
- Choppy narration gone (incident 3), the background service across lock/app switch/airplane mode, Listen now timing, late ambience cues, and upgrading from either earlier build (DB migration 0005 repair).
- ADR-0008 says window 4–8; the code is 3–6 after the merge. The ADR needs an amendment line.

## Decisions
ADRs 0001–0008 in `docs/decisions/`:
- client-only BYOK
- Expo SDK 57 hybrid audio
- narration via OpenRouter, with Gemini Flash Lite as the default and three narrators
- layered extraction
- ambience beds (2026-10-17 amendment: coverage, CC-BY allowed, 30+ beds)
- LLM output contracts (sampling hints are never sent with `require_parameters`, after incident 4)
- background processing
- progressive narration

## Handoff
- **Last session:** 2026-10-17. Built BG1, N2, AM1, SND1, F1/F2 and C1, fixed incident 4, unified the code lines (I3) and built APK `ced9221`.
- **Next:** finish the cleanup, then run the Q2 audits.
- **Key files:** `docs/briefs/Q2-debug-audit.md`, `docs/briefs/I3-resolution-log.md`.
