# Brief Q1: AAA QA audit (four tracks, read-only)

**Type**: audit and research only. **Do not edit code, assets or docs, and do not commit.** Report findings in your final message. The architect compiles them into `docs/qa/`.

Read `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/STATE.md`, `docs/ARCHITECTURE.md`, then the code for your track. The bar is a top-tier studio shipping a premium app. Other workers are editing code at the same time (N3: transport/pipeline/library; A4: sounds/taxonomy). Audit the committed code as it is now, and note any part that may change.

## Tracks (one worker each)
- **QA-A: Pipeline, data and network.**
  - Scope: `src/core/**` (except analysis prompts), `src/services/**`, `src/db/**`.
  - Look at:
    - correctness: races, cancellation, resume, idempotency, migrations, transactions, orphan files, FS growth, cleanup when a chapter or series is deleted
    - error mapping and copy
    - cost and usage-ledger accuracy
    - the BYOK key handling (storage, redaction in logs and Diagnostics)
    - input limits: huge pages, PDFs and odd encodings
- **QA-B: Player and audio.**
  - Scope: `src/audio/**`, `src/core/playback/**`, `src/features/player/**`, `src/features/settings` (narration/ambience parts).
  - Look at:
    - state-machine holes
    - segment-swap gap and position accuracy
    - seek, repeat and speed edge cases
    - ambience behaviour on pause, interruption, end and chapter switch (known: beds keep playing while paused)
    - lock-screen metadata
    - memory and decoder lifetime
    - battery: the update intervals and timers
    - sleep timer
    - streaming playback while narration is still arriving
- **QA-C: UX, UI and accessibility.**
  - Scope: `app/**`, `src/features/**`, `src/ui/**`.
  - Look at:
    - every screen's empty, loading, error and offline states
    - copy quality (plain, specific, no jargon)
    - consistency of spacing, typography and motion tokens
    - dark/light contrast (compute ratios for text tokens)
    - touch targets ≥ 48 dp
    - screen-reader labels, roles and focus order
    - font scaling to 200%
    - haptics, keyboard handling and back navigation
    - first-run onboarding friction
    - what a premium audiobook app (Audible, Apple Books, Speechify, Pocket Casts) does that we don't
  - Optional: a web export (`npx expo export -p web`) plus Playwright screenshots at 400 px in both themes, saved under `/tmp/claude-0/-home-user-App-idea/005bdf22-f3a2-59c7-918d-ae1c7220d1ea/scratchpad/qa-c/`. Web is a fake-data preview, so note any limits.
- **QA-D: Performance, size, startup and code health.**
  - Scope: the whole repo.
  - Look at:
    - startup path work, bundle size and its biggest modules (use the Metro bundle output, `npm run bundle:check`)
    - re-render hot spots: zustand selectors, lists without virtualization
    - DB query patterns and indexes
    - large synchronous work on the JS thread: analysis JSON, PDF, WAV joins
    - `npm audit` triage: runtime vs dev
    - dead code and duplication
    - test gaps in critical paths
    - CI readiness

## Report format
- **Findings**, ranked by severity:
  - **P0**: crash or data loss
  - **P1**: user-visible bug
  - **P2**: AAA polish or inefficiency
  - **P3**: nice to have
- **Each finding** has:
  - file:line
  - what happens and how to reproduce it (or the reasoning)
  - the proposed fix
  - effort: S, M or L
- **Separately: "Bigger jumps"**: ideas needing more time or a product decision. For each, give the value, the cost and the risks.

Evidence: quote the code you cite. Never claim a bug you didn't trace. Mark a hypothesis as a hypothesis.
