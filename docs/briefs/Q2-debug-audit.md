# Brief Q2: Debug audit on the unified code (three read-only audits)

**Type**: audit (read-only, except new failing tests that prove a finding; don't fix). Runs after I3 lands. There are three audits: **QA-E**, **QA-F** and **QA-G**. Each worker gets one, and at most 2 run at once.

**Read first**: `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/STATE.md` (Incidents 1–4, the debug sweep plan, and the merged charming-fermat sections), `docs/briefs/I3-resolution-log.md`, and the earlier audits `docs/qa/2026-10-13-QA-{A,B,C,D}-*.md`.

## Method (all audits)
- **Re-check every 2026-10-13 finding in your area** against the unified code. Mark each one fixed, still open, or regressed, with the file and line.
- **Find new bugs and inefficiencies** by reading the code paths end to end, as the user experiences them. Prioritize what the user hits on a real Android phone:
  - Jest mocks native modules, so look hard at native boundaries and async timing.
  - Look at app lifecycle (background, foreground and process death), Hermes vs Node differences, and Android-only behaviour.
- **Each finding**:
  - an id (`E-01`…), a severity:
    - **P1**: the user hits it, or data is lost or corrupted
    - **P2**: noticeable degradation
    - **P3**: polish or inefficiency
  - a title, a concrete **reproduction path** (from a real user action to the failure), the evidence (code refs and quoted lines), the root cause and a proposed fix
- **Prove P1s with a failing test where possible.** Add it as `*.audit.test.ts`, excluded from `verify` via `testPathIgnorePatterns`, so the fix wave can flip it on.
- **No speculation without a path.** "Could be" findings go to a short "Hypotheses to check on device" list at the end.
- **Output**: `docs/qa/2026-10-17-QA-<E|F|G>-<area>.md`, with a summary table first.

## QA-E: audio, player and background
Scope: `src/audio/**`, `src/features/player/**`, `modules/lectio-background/**`, `src/features/pipeline/{background-work,pipeline-lifecycle,processing-notice}.ts*` and `app/_layout.tsx`. Must cover:
- **Choppy and stuttering narration (the user's top complaint, twice).**
  - Prove incident 3 cannot recur: confirm there is exactly one audio-focus client.
  - Then hunt for every other cause of stop/start:
    - segment swaps and gaps
    - WAV vs MP3 decode and load latency
    - re-renders re-issuing play
    - `setCues` and late-cue reloads touching the voice
    - the narrating-ahead `buffering` state flapping
    - the scrubber/position poll fighting the engine
    - ducking/mixer automation clicks
    - the foreground-service start/stop interacting with expo-audio's media service
    - the 2× speed pitch path
- Background:
  - the service lifecycle on Android 13/14/15
  - starting the service while backgrounded
  - its interplay with expo-audio's foreground service
  - wake/Wi-Fi lock leaks
  - process death mid-chapter, with queue restore and notification state
- Player state machine: auto-advance, resume per chapter, bookmarks, sleep timer, interruptions (call, other app) and the lock screen.

## QA-F: pipeline, network, data and cost
Scope: `src/core/{pipeline,translate,analysis,text,narration,llm}/**`, `src/services/**` and `src/db/**`. Must cover:
- The concurrent runner (analysis beside translate → narrate): races, double-writes, abort propagation, the job hash and skip semantics, resume after process death, and the stall watchdog together with the backoff queue (double retries?).
- **Money**: anything that re-buys paid work, including:
  - re-synthesis after an app update
  - the plan or hash changing between runs
  - cue cache misses
  - retries after a partial success
  - translation re-runs
  - the cost ledger's accuracy against OpenRouter's reported `usage.cost`
- **OpenRouter contract**: use C1's `npm run contract:check` output, plus anything it cannot see (error mapping that turns real 400s into retries, or vice versa).
- **Data integrity**: theirs' F3 list (alias spoiler leak, playability, stale translations, ledger, storage, keep paid passages, PDF cap), the migration edge cases from I3, orphaned audio files, and disk growth (WAV at about 170 MB/h).

## QA-G: UX, accessibility and performance
Scope: `app/**`, `src/features/**` (except the player, which is QA-E's) and `src/ui/**`. Must cover:
- Every user flow from onboarding to a finished chapter: error copy, empty/loading/error states, and what the user sees for every error code.
- Startup time, JS bundle size, list virtualization, re-render hot spots (the React Compiler rules), SQLite query cost on the main thread, and memory for long chapters (thousands of sentences).
- A11y regressions since QA-C.

## Constraints
- Read-only apart from the audit tests and the report. Don't fix. No real paid API calls; public keyless OpenRouter metadata is fine.
- Work in your worktree; `ln -s /home/user/App-idea/node_modules node_modules` if it is missing. Commit the report and audit tests with your harness Co-Authored-By trailer plus `Claude-Session: https://claude.ai/code/session_016sqBEw3paK5QXmP6QkprQ9`. Do not push.
- Context budget: at about 220k tokens (about 150 tool calls), commit what you have with a "Coverage so far / not yet audited" section, and report.
