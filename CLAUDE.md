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
- `docs/STATE.md`: current status, milestones and next actions (short; read first, every session)
- `docs/ARCHITECTURE.md`: system overview and sentence spine, with an index to `docs/architecture/*.md` (pipeline, memory-qa, ambience, player, data-security-verification)
- `docs/CONVENTIONS.md`: code style, structure, testing and commits
- `docs/decisions/`: ADRs
- `docs/research/`: research reports from workers (see `docs/research/README.md`)
- `docs/briefs/`: task briefs, one per worker task
- `docs/archive/`: old history, e.g. the full pre-slimming STATE

## Context discipline (keeps sessions cheap)
**Default read on session start:** this file and `docs/STATE.md`. Then only the brief you are given. Nothing else unless the routing table says so.

**Never open unless the user or a brief names the file:**
- `docs/research/*` (about 19k words; the decisions from them are already in the ADRs)
- `docs/archive/*`
- briefs other than the one assigned (finished briefs are history)

**Routing: what to read for which work**
| Working on | Read | Code to open |
|---|---|---|
| Ingest, extraction, cleaning | `docs/architecture/pipeline.md`, ADR-0004 | `src/core/extract`, `src/core/text`, `src/services/extraction` |
| Pipeline, jobs, resume | `docs/architecture/pipeline.md` | `src/core/pipeline`, `src/services/pipeline` |
| Analysis, memory, Q&A | `docs/architecture/memory-qa.md`, ADR-0006 | `src/core/analysis`, `src/core/memory`, `src/features/ask` |
| Translate, narrate, voices | `docs/architecture/pipeline.md`, ADR-0003 | `src/core/translate`, `src/core/narration`, `src/services/openrouter`, `src/features/settings` |
| Ambience, mixer, sound packs | `docs/architecture/ambience.md`, ADR-0005 | `src/audio`, `assets/ambience`, `src/core/playback` |
| Player UI, learner mode | `docs/architecture/player.md` | `src/features/player`, `src/features/vocab`, `src/audio` |
| Library, series, chapters | `docs/architecture/data-security-verification.md` | `src/features/library`, `src/features/series`, `src/features/chapter`, `src/db` |
| Design system, shared UI | `docs/specs/design-system.md` | `src/ui` |
| Data model, DB | `docs/specs/domain.md`, `docs/architecture/data-security-verification.md` | `src/db`, `src/core/domain` |

Each major `src/` folder has a `README.md` map (what lives where, entry points, gotchas). Read the map before listing or opening files in that folder.

**Delegation rule for exploration:** before opening more than about 3 files to find something, hand the search to the `Explore` agent (or `haiku-worker` if it needs to implement) and work from its summary. Subagent reads stay out of the architect's context. This does not change who may implement: workers are still only `haiku-worker`.

**End of every session:** a worker (or the architect) overwrites the "Handoff" block in `docs/STATE.md` (what changed, what is next, which files matter). Keep STATE.md under ~500 words and move history to `docs/archive/`. Start a fresh session per brief, and compact or restart once context passes about 50%.

## Commands (once the app is scaffolded)
- `npm run typecheck`, `npm run lint`, `npm test`: these must pass before any task is marked done.
