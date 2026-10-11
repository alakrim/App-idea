# STATE: source of truth

_Last updated: 2026-10-11 by architect_

## Current phase
**M1 → M2/M5/M6 groundwork**. Wave 2 (B1–B7) is done and verified. Wave 3 (I1, F0, F5, A1, A2) is running.

## Milestones
| # | Milestone | Status |
|---|---|---|
| M0 | Protocol docs, research R1–R4, architecture v1, stack decision | ✅ done (ADRs 0001–0005) |
| M1 | Scaffold, design system + shell, domain + DB, text engine, OpenRouter client, extraction, analysis + memory | ✅ done (664 tests, verify green) |
| M2 | Settings (API key validate + usage), Library (Series CRUD + cover), Chapter add (URL/PDF/text) | ✅ done (U1, U2); share-intent deferred |
| M3 | Pipeline orchestrator: job graph, extract→clean→segment wiring, WebView fallback, PDF | not started |
| M4 | Analysis wiring: cues + memory + codex persisted, cost preview | not started |
| M5 | Translation + narration (TTS) + voice picker with previews + usage ledger | not started |
| M6 | Player: AudioEngine (expo-audio voice + react-native-audio-api ambience), mixer, synced text, learner mode; procedural sound pack build | not started |
| M7 | Ask (spoiler-safe Q&A), Vocab | ✅ done (U4) |
| M8 | Polish, accessibility, performance, EAS build, device spike S1 + probes P1/P2, Maestro E2E | not started |

## Work in flight
| Task | Brief | Status |
|---|---|---|
| U3 Player experience (full player, synced text, learner mode) | docs/briefs/U3-player-ui.md | running |
| P2 Pipeline services: real ports + facade, end-to-end slice | docs/briefs/P2-pipeline-services.md | running |

## Next up
- **I2** integration pass (after U3/P2): the U4 items above, dedupe `use-db-read` vs `src/db/hooks.ts`, dedupe the language lists (U1/U2), the M8 polish list.
- **S1 device spike** checklist (from A2): lock-screen next/prev/seek is not exposed by expo-audio 57; segment swap gap; pitch at 2×; audio session ownership expo-audio vs audio-api; interruptions; ducking latency < 100 ms; 45 min background ambience.

## UI review notes (architect, from web screenshots of B2), for the M2 feature UI brief
- Large titles hug the top edge. Add `sm` top padding under the safe area.
- New series: the cover preview is screen-filling. Use a 2:3 cover picker about 168 pt wide with an "Add cover" overlay, and an image-plus prompt instead of the monogram when the name is empty.
- Player empty state: replace the fake "N" cover with an EmptyState. Center the ambience chip with the title block.
- Settings rows: add a chevron plus a current-value subtitle ("Not set", "Gemini · Kore", "−22 dB").
- Light theme `accent` #B9761A is 3.37:1 on bg. Darken it until the contrast is ≥ 4.5 for text use, or restrict it to icons and large text.

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
- [B6] **Metro bundling of the extract stack**: import `src/core/extract` from app code and prove `bundle:check` passes (defuddle's exports map is `import`-only, and linkedom is ESM). Fix via metro `unstable_conditionNames` / resolver if needed.
- [B6] Lexicon signal is inert because it is scored after the post-filter. Score lexicon hits on the *pre-filter* blocks as an information signal, weighted lightly (0.05), and re-balance the weights. Calibrate on a real corpus later (M8).
- [B6] Kicker/section-label lines ("Weather | Live updates"): add a rule for short pipe-separated label lines without terminal punctuation.

## Verified wave-2 results
- B2 UI shell: 27 app tests, visually reviewed via web export + Playwright (dark/light). B3 DB: 47 tests; B4 text: 218 tests; B5 OpenRouter: 84 tests; B6 extract: 171 tests; B7 analysis/memory: 117 tests (all re-run by architect).
- [F5+B7] **LLM transport v2** (for the pipeline brief): create `src/core/llm/transport.ts` with `LlmTransport = (req: {system, user, jsonSchema?: {name, schema}, signal?}) => Promise<{text, usage: {promptTokens, completionTokens, costUsd|null}}>`. Move the shared `stripCodeFence`/tolerant parse there. Migrate analysis and translate to it so real usage flows to the ledger and in-flight calls are abortable. The app adapter wraps `openrouter.chatJson`/`chatText`.
- [F5] Persist `partialIdx` (untranslated sentences), e.g. `sentences.translated = null` plus a chapter-level flag, so the UI can show it.
- [I1] Ingest must write `chapters.word_count` via `estimateWordCount` (the cue cap depends on it).
- [I1] Analysis JSON schema: describe cue items fully (nullable fields) instead of `z.unknown()` (ADR-0006 §2).
- [I1] The extraction stack adds +2.06 MB Hermes bytecode. Acceptable for now; revisit in M8 (lazy require inside the pipeline worker).
- [I1] ✅ All 11 fixes done and verified (819 core/node tests).
- ✅ Verified + committed: F5 translate (84 tests), F0 app infrastructure (55 tests), A2 audio engine (133 tests). Repo total ≈ 1,000 tests.
- [A1] ✅ Base pack accepted (roll 2048, verify green). M8: replace the single-sample jump gate with a windowed click detector (≥ 8 kHz band energy in ±1 ms at the wrap vs the internal p99.9 of the same statistic); it is currently a noisy check. Listening test on device (S1) is the real gate.
- [P1] ✅ Pipeline core verified (core+node suites green, `src/core` lint clean). P2 notes:
  - `ChapterRecord.narration` needs a real `NarrationProfile` row (id): upsert the profile from settings.
  - `setTranslations` stores `translated: null` for `partialIdx`.
  - The PDF adapter must split pages (header/footer removal depends on it).
  - The Fetcher enforces 5 MB / 30 s.
  - Delete stale audio files when the segment count shrinks.
  - Persist per-chapter run options (`from`/`force`/`pdfEngine`) with the queue.
  - Dedupe JSON parsing: `core/extract/select.ts` and `services/openrouter/json.ts` → `core/llm/json.ts`.
- [U1] ✅ Settings + onboarding accepted (112 tests; screenshots reviewed). M8 polish: drop the duplicate "Default" badge when it equals "Recommended"; multi-line style field; ScrollView + keyboard handling on onboarding step 2 (small phones); ambience "Play a sample" once the player exposes a sample API; move the usage stage query into `usageRepo`; export the catalog snapshot schema from `services/openrouter/models.ts`.
- [U2] ✅ Library/series/chapters accepted (74 tests; screenshots reviewed: shelf, series hero + stepper, add-chapter preview + estimate, bilingual reading). Android HBC bundle is now 11 MB.
- [U4] ✅ Ask + Vocab accepted (89 UI + 88 repo tests; a spoiler mutation test proved the cutoff tests bite).
  **Integration (I2, after U2/U3):**
  - mount `VocabActionsProvider` in `app/_layout.tsx` (under DB + OpenRouter) so the player can save vocab
  - `app/chapter/[chapterId]` must honour the `sentence` param (scroll to it and highlight)
  - add `reviewedAt`/`known` to the domain `VocabSchema`
  - move the vocab prompt + schema to `src/core/vocab/prompts.ts`
  - `Card raised` top highlight is invisible in the light theme; use a border-top in light
  - **Polish:** Vocab review buttons should span the width (two equal buttons), with the card vertically balanced. A "not revealed yet" answer should carry no citation chip.
- [U3] ✅ Player accepted (89 tests). **Architect root-caused U3's open issue 1**: `usePlaybackContent` called a zustand hook as `content(selector)`, which the React Compiler memoized as a plain call. Fixed with `useStore`, all `'use no memo'` removed, and the fix verified by reproducing error #300 in a web build before the fix and clean after it. The rule is now in CONVENTIONS.
  Open: web preview cannot open expo-sqlite (sync op timeout + missing `wasm` assetExt), so web is a fake-data preview only; device is the real target. Repeat-sentence precision is ±250 ms (4 Hz position). Gestures need device verification (S1). The ambience display names come from category ids; add proper labels to the taxonomy (I2).
