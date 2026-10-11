# Lectio — project guide

**Lectio** (working name) is a mobile app, Android first with iOS planned, that turns any URL or PDF into an immersive, professionally narrated audiobook. People use it for language learning or to listen instead of read. The quality bar is AAA: every screen, sound and error message must feel premium.

## Operating protocol
- **Architect/orchestrator** is the Opus session. It owns decisions, interfaces, briefs, approval gates and replanning. It reads summaries and does not do bulk coding.
- **Workers** are only ever `haiku-worker` (`.claude/agents/haiku-worker.md`: Haiku, high effort). No other model or effort is allowed.
- **The user** sets goals, answers questions and approves major gates.
- **The repo is the memory.** `docs/STATE.md` is the source of truth for progress. Decisions go in `docs/decisions/` (ADRs). Task briefs go in `docs/briefs/`.
- Work is complete only when it has been verified independently and the evidence (commands plus output) is recorded.
- Get the user's explicit approval before destructive or irreversible actions, external spending (real paid API calls), secrets access or production changes.

## Product pillars
1. **Library**: a Series has a name and a cover image, and holds Chapters.
2. **Ingest**: a Chapter comes from a URL or a PDF. The cleaner keeps the main content only, with no ads, nav, comments or buttons.
3. **Analysis**:
   - *Ambience cues*: background soundscapes anchored to sentence ranges, with fade in and out.
   - *Chapter memory*: a compact structured memory per chapter. It powers spoiler-safe Q&A about earlier chapters.
4. **Translate** (optional) with a model the user picks, then **narrate** with a voice model the user picks. Calls go through OpenRouter using the user's own key (BYOK).
5. **Player**: background audio, lock-screen controls, ambience mixed under the voice with ducking, synced text highlight and bilingual view for learners.

## Key docs
- `docs/STATE.md`: current status, milestones and next actions
- `docs/ARCHITECTURE.md`: system design, data model and pipelines
- `docs/CONVENTIONS.md`: code style, structure, testing and commits
- `docs/decisions/`: ADRs
- `docs/research/`: research reports from workers
- `docs/briefs/`: task briefs, one per worker task

## Commands (once the app is scaffolded)
- `npm run typecheck`, `npm run lint`, `npm test`: these must pass before any task is marked done.
