# STATE: source of truth

_Last updated: 2026-10-11 by architect_

## Current phase
**M1: Foundations**. Wave 2 (B2–B7) is running in parallel.

## Milestones
| # | Milestone | Status |
|---|---|---|
| M0 | Protocol docs, research R1–R4, architecture v1, stack decision | ✅ done (ADRs 0001–0005) |
| M1 | Scaffold (B1 ✅), design system + shell (B2), domain + DB (B3), text engine (B4), OpenRouter client (B5), extraction (B6), analysis + memory (B7) | in progress |
| M2 | Settings (API key validate + usage), Library (Series CRUD + cover), Chapter add (URL/PDF/share-intent) | not started |
| M3 | Pipeline orchestrator: job graph, extract→clean→segment wiring, WebView fallback, PDF | not started |
| M4 | Analysis wiring: cues + memory + codex persisted, cost preview | not started |
| M5 | Translation + narration (TTS) + voice picker with previews + usage ledger | not started |
| M6 | Player: AudioEngine (expo-audio voice + react-native-audio-api ambience), mixer, synced text, learner mode; procedural sound pack build | not started |
| M7 | Ask (spoiler-safe Q&A), Vocab | not started |
| M8 | Polish, accessibility, performance, EAS build, device spike S1 + probes P1/P2, Maestro E2E | not started |

## Work in flight
| Task | Brief | Status |
|---|---|---|
| B2 Design system + navigation shell | docs/briefs/B2-design-system-shell.md | running |
| B3 Domain schemas + SQLite/Drizzle + FTS5 | docs/briefs/B3-domain-db.md | running |
| B4 Text engine (segmentation, chunking, timing) | docs/briefs/B4-core-text.md | running |
| B5 OpenRouter client + cost | docs/briefs/B5-openrouter-client.md | running |
| B6 Extraction engine | docs/briefs/B6-core-extract.md | running |
| B7 Analysis + memory + Q&A assembly | docs/briefs/B7-core-analysis.md | running |

## Done (verified by architect)
- R1–R4 research: `docs/research/`. R1's key claim (OpenRouter `/audio/speech` plus 32 speech models) was re-verified live by the architect.
- B1 scaffold: the architect re-ran `npm run verify` (exit 0) and `expo-doctor` (21/21).

## Decisions
- ADR-0001: Client-only BYOK, no backend
- ADR-0002: Expo SDK 57; hybrid audio (expo-audio voice + react-native-audio-api ambience) behind `AudioEngine`, conditional on device spike S1
- ADR-0003: Narration via OpenRouter `/audio/speech`, live voice catalog, three price tiers plus offline device voice
- ADR-0004: Layered extraction (dual extractor, quality gate, WebView fallback, LLM index-selection)
- ADR-0005: Ambience beds only in v1, max 2, −22 dB, procedural base pack, CC0-first ledger

## Open questions for the user
1. **Android device for spike S1 / probes P1–P2.** These need a dev build on a physical Android phone (through EAS with your Expo account, or a local build if you install the Android SDK). When can you test?
2. **Paid listening test (~$0.20 of your OpenRouter credits)** to compare narration quality across languages and voices before we pick defaults. OK to spend?
3. **Sampled ambience sounds.** v0 ships synthesized beds (rain, wind, ocean, crowd, space hum, fire). For realistic horses, battles, taverns and so on we need CC0 recordings. Option A: you create a free Freesound API key so a worker can curate CC0 sounds. Option B: you approve an existing commercial pack.
4. **App name.** "Lectio" is a working name. Keep it?

## Notes
- The `haiku-worker` agent file loads on the next session start. Until then, workers are spawned as general-purpose with model=haiku and effort=high, using the same instructions file.
- B1 scaffold installed: Expo SDK 57 (`expo@57.0.27`, `expo-router@57.0.25`), React Native `0.86.3`, React `19.2.3`. Also TypeScript `6.0.3`, Jest `29.7.0` (`jest-expo@57.0.5`), ESLint `9.39.5`, Prettier `3.9.10`.
- Wave-2 deps (installed centrally by the architect): zod 4.6.5, drizzle-orm 0.45.4, expo-sqlite 57.0.4, expo-audio 57.0.5, defuddle 0.19.5, linkedom 0.18.13, @gorhom/bottom-sheet 5.2.14, lucide-react-native 1.55.0, better-sqlite3 13.0.3 (dev).
- `npm audit` reports 65 transitive vulnerabilities, mostly in dev/build tooling. To triage in M8.
- New Architecture: always on from SDK 55+, so no config key is needed.

## Integration backlog (for brief I1, after wave 2)
- [B7] `buildQaPrompt` FTS hits: allow earlier chapters too (`order < cutoff` OR `order == cutoff && idx <= sentence`); the DB repo must match. Add tests.
- [B7] keyEvents merge across chunks: sample evenly across chunks instead of keeping the first 10.
- [B7] Cue density cap: chapters of 200–500 words get at most 1 cue (currently 0).
- [B5+B7] Strict json_schema mode: LLM output schemas must use `.nullable()`, never `.optional()`. Add a normalizer that maps null to absent after parsing, and add this to CONVENTIONS.
- [B5] Reconcile `services/openrouter/errors.ts` with `core/domain` (import the shared types).
- [B5] 402 with `limit_source: openrouter_in_flight_budget` should be retryable after Retry-After.
- [B7] Swap the local chunk planner for `planLlmChunks` from core/text once B4 lands.
- [B3] Deleting the furthest chapter cascades the position row. Instead, move `furthest`/`current` to the end of the previous chapter (or delete only if none). Add a test.
- [B3] Add a test asserting `bundled-migrations.ts` lists every entry in `migrations/meta/_journal.json` (read via fs in Node).
- [B3] Repos still missing: narration_profiles, ambience_cues, chapter_memory, entities/entity_facts, audio_segments, qa_messages, vocab, settings (zod-validated). Assigned to the M2–M5 feature briefs as needed.
- [B3] Call `useLectioMigrations()` in `app/_layout.tsx`, gating render with a designed splash/error state.
