# STATE: source of truth

_Last updated: 2026-10-11 by architect_

## Current phase
**M0: Foundations and research**

## Milestones
| # | Milestone | Status |
|---|---|---|
| M0 | Protocol docs, research R1–R4, architecture v1, stack decision | in progress |
| M1 | App scaffold: Expo + TS strict, lint/test/typecheck, design system, navigation shell, DB schema + migrations | not started |
| M2 | Settings (API key validate + credits), Library (Series CRUD + cover), Chapter add (URL/PDF/share-intent) | not started |
| M3 | Extraction + cleaning pipeline (local + conditional LLM), segmentation, job graph | not started |
| M4 | Analysis: ambience cues + chapter memory + series codex | not started |
| M5 | Translation + narration (TTS) + cost preview + usage ledger | not started |
| M6 | Player: background audio, ambience mixer, synced text, learner mode | not started |
| M7 | Ask (spoiler-safe Q&A), Vocab | not started |
| M8 | Polish, accessibility, performance, EAS build, Maestro E2E | not started |

## Work in flight
| Task | Brief | Owner | Status |
|---|---|---|---|
| R1 OpenRouter capabilities | docs/briefs/R1-openrouter-capabilities.md | haiku-worker | running |
| R2 Mobile stack & audio | docs/briefs/R2-mobile-stack.md | haiku-worker | running |
| R3 Content extraction | docs/briefs/R3-content-extraction.md | haiku-worker | running |
| R4 Ambience library | docs/briefs/R4-ambience-sound.md | haiku-worker | running |

## Decisions
- ADR-0001: Client-only BYOK architecture, no backend (see docs/decisions/)

## Open questions for the user
_(none yet)_

## Notes
- The `haiku-worker` agent file loads on the next session start. Until then, workers are spawned as general-purpose with model=haiku and effort=high, using the same instructions file.
