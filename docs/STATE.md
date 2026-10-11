# STATE: source of truth

_Last updated: 2026-10-11 by architect_

## Current phase
**Core loop complete in code** (URL/PDF/text → extract → clean → analyze → translate → narrate → play, with ambience, memory Q&A and vocab). 1,467 tests, e2e green. Now: device build + integration polish. Previously: **M1 → M2/M5/M6 groundwork**. Wave 2 (B1–B7) is done and verified. Wave 3 (I1, F0, F5, A1, A2) is running.

## Milestones
| # | Milestone | Status |
|---|---|---|
| M0 | Protocol docs, research R1–R4, architecture v1, stack decision | ✅ done (ADRs 0001–0005) |
| M1 | Scaffold, design system + shell, domain + DB, text engine, OpenRouter client, extraction, analysis + memory | ✅ done (664 tests, verify green) |
| M2 | Settings (API key validate + usage), Library (Series CRUD + cover), Chapter add (URL/PDF/text) | ✅ done (U1, U2); share-intent deferred |
| M3 | Pipeline orchestrator: job graph, extract→clean→segment wiring, WebView fallback, PDF | ✅ done (P1, P2) |
| M4 | Analysis wiring: cues + memory + codex persisted, cost preview | ✅ done (P1, P2) |
| M5 | Translation + narration (TTS) + voice picker with previews + usage ledger | ✅ done (F5, P1, P2, U1) |
| M6 | Player: AudioEngine, mixer, synced text, learner mode; procedural sound pack | ✅ done in code (A1, A2, U3); device validation pending (S1) |
| M7 | Ask (spoiler-safe Q&A), Vocab | ✅ done (U4) |
| M8 | Polish, accessibility, performance, EAS build, device spike S1 + probes P1/P2, Maestro E2E | not started |

## Work in flight
_None. Waiting on the user's device test of `lectio-0.1.0-c3eac7a-arm64.apk` (apk-builds branch). It fixes the Library crash (cover monogram at font size 0). The user asked for bug fixes only until they have tested properly._

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

## Open questions for the user (answered 2026-10-11)
1. **Device test**: the user will install and test the APK once it is sent. → B8 is producing it.
2. **Paid listening test**: approved. The user will add a dedicated OpenRouter key (credit limit $1) as the environment secret `OPENROUTER_API_KEY`, which is visible from the next session. Rules: read it only from env, never write it to the repo, files or logs. After the test, remind the user to revoke the key on openrouter.ai and remove the variable.
3. **Freesound**: the user will create an API key and add it as `FREESOUND_API_KEY` (next session). Use CC0 sounds only, with a ledger entry per file.
4. **Name**: keep "Lectio" for now.

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
- [P2] ✅ Pipeline services accepted: 8 e2e scenarios green (URL, text, PDF, scanned PDF + OCR, WebView render, cancel/resume, voice change, AUTH pause/resume), verified by the architect. Device-only: WebView bridge limits, RN fetch UA/streaming, keep-awake, picked-PDF URIs, live `cloudflare-ai` page output.
- [U3] ✅ Player accepted (89 tests). **Architect root-caused U3's open issue 1**: `usePlaybackContent` called a zustand hook as `content(selector)`, which the React Compiler memoized as a plain call. Fixed with `useStore`, all `'use no memo'` removed, and the fix verified by reproducing error #300 in a web build before the fix and clean after it. The rule is now in CONVENTIONS.
  Open: web preview cannot open expo-sqlite (sync op timeout + missing `wasm` assetExt), so web is a fake-data preview only; device is the real target. Repeat-sentence precision is ±250 ms (4 Hz position). Gestures need device verification (S1). The ambience display names come from category ids; add proper labels to the taxonomy (I2).

## Live test findings (2026-10-11, architect, user-approved key with a $1.50 limit, spent $0.067)
Ran our real `services/openrouter` client and the core analysis/translate engines against live OpenRouter. The key was never written to disk or the repo.
- ✅ `/key` validation, the model catalogue, `chatRaw` strict json_schema with `anthropic/claude-haiku-5.5`, the analysis engine (accurate memory and glossary) and zh→it translation (fluent, glossary respected, «» dialogue) all worked first time. The `mp3DurationMs` parser read every real MP3 correctly.
- ❌ **Gemini TTS is PCM-only** (400 on `mp3`; `pcm` returns `audio/pcm;rate=24000;channels=1`). The default narration model would have failed on every chapter. → L1.
- ❌ **CJK ambience cues are always dropped**: the duration heuristic used 15 chars/s, but Mandarin is ~4.5 chars/s. → L1.
- ⚠️ Error mapping turned that 400 into a retryable "Try again". → L1.
- ⚠️ Microsoft MAI and Mistral Voxtral voices are locale-specific (Voxtral: en/gb/fr only; MAI: no ja). The voice picker must filter by target language. → L1 (core) + a later UI wiring step.
- ⚠️ The analysis prompt is ~4.7k tokens per call, so prompt caching is worth adding. → L1.
- Gemini `instructions` steering works: an Italian sample took 14.4 s with the narrator style and 10.5 s without it.
- Pure-JS MP3 encoding (lamejs) was rejected: LGPL, and only 2× real time in an interpreter (V8 `--jitless`). → Plan **E1**: a native Android AAC encoder module (MediaCodec + MediaMuxer, local Expo module), WAV → m4a after synthesis. Until then, PCM models store WAV (~170 MB/h).
- Listening page for the user: https://claude.ai/artifact/R3d3Rxb42W5rm1hn6wqhJp. **User decision: Gemini 3.8 Flash Lite TTS is the default for all languages (ADR-0003 amendment). E1 native AAC encoder is now a priority.**
- Reminder: ask the user to **revoke the test key** on openrouter.ai once the voice choice is settled. Any later live verification needs a new key.
- [B8] ✅ Local Android build works: `scripts/android/build-apk.sh` (SDK bootstrap + Maven Central → Google mirror for 429s), release arm64 APK signed with the debug key, ~7 min. Permissions trimmed to network, media foreground service, wake lock, vibrate and audio settings. Doc: `docs/BUILD-ANDROID.md`.
- [I2] ✅ Integration and polish accepted (verify green, 1,636 tests). Delivered: vocab from the player, sentence deep links, ambience labels and icons, dedupes, polish list, ambience sample, usage by stage, **Diagnostics screen** (About → 7 taps on the version). Skipped: Ask chips can't deep-link to a sentence because citations carry no sentence index (needs a prompt change; backlog).
- [L1] ✅ Live-API fixes accepted. The architect set the cue floor to 12 s (ADR-0005 amendment) and bumped the analysis prompt to v2.
- **Live re-check (architect):** Gemini narration through the real `tts` adapter returns valid WAV (12.6 s). **Speech rates calibrated** from the live samples (Latin 9.2, Han 2.5, Japanese 4.2 chars/s). C1 is updating the tests that hard-coded the old numbers.
- Backlog: an orphaned `<idx>.mp3` stays on disk when a chapter switches to WAV; move the `.wav` preview handling into `preview-cache.ts`; Ask citations should carry a sentence index.
- **APK delivery (2026-10-11):** chat uploads cap at 30 MB. The user chose repo delivery and no size-motivated risk. APKs are published on the **`apk-builds` orphan branch** (binaries kept out of the code branch history; README with install steps + SHA-256). First build there: `lectio-0.1.0-2f87cb9-arm64.apk` (70.2 MB, no R8).
- **R8/resource shrinking reverted** (user decision). Can strip JNI/reflection-only classes and fails only on a device; revisit for Play builds after device tests. Kept, because they're lossless: compressed native libs, fonts trimmed from 36 to the 7 used, icons from 1,892 to 121 lucide modules.

## Incident: launch crash on device (2026-10-11), RESOLVED in code, pending device confirmation
- **Symptom (user):** the APK installs; the icon animates, the screen goes black for ~1 s, then the app closes.
- **Root cause (X1, with source-mapped evidence):** `src/core/domain/ids.ts` created a ULID generator at module load. ulid's React Native build throws `PRNG_DETECT` when `globalThis.crypto.getRandomValues` is missing, and Hermes has no Web Crypto. Jest resolved ulid's Node build, so 1,600+ tests passed.
- **Fix:** an expo-crypto-backed `crypto.getRandomValues` polyfill loaded first in `index.js`, plus a safe fallback in `ids.ts` and a regression test using ulid's browser build.
- **Prevention:**
  - `npm run boot:check` boots the release bundle with Hermes-only globals and stubbed native modules. Open item: it stalls before the first route renders, so it cannot yet prove later startup paths.
  - **On-device crash reporter (X2):** any future crash shows its report on the next launch (Copy/Share), and it stays in Diagnostics → Last crash.
- Ruled out along the way: the GitHub upload (byte-identical), Hermes bytecode/runtime versions (both 250829098.0.17), native lib deps, 16 KB page alignment, manifest/services, the extraction stack's module init.

## Incident 2: Library crash on device (2026-10-11), fixed in c3eac7a
- The crash reporter captured it: `IllegalArgumentException: FontSize should be a positive value. Current value: 0` in `TextAttributeProps.getLetterSpacing` (Samsung SM-S928B, Android 15).
- **Cause:** `CoverImage` sized its monogram from onLayout width, which is 0 on the first render. Android throws for font size ≤ 0, while iOS, web and Jest accept it.
- **Fix:** the monogram waits for a real width, and the shared `Text` never renders a non-positive/NaN font size. Regression tests mutation-checked (fail without the fix).
