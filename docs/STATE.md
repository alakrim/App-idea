# STATE: source of truth

_Last updated: 2026-10-11 (night) by architect_

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
- **A4** clean ambience v2: 50+ single-purpose, era-aware beds with AudioSet/CLAP screening (`docs/briefs/A4-clean-ambience-v2.md`). A worker is on it. It replaces A3's contaminated picks (storm with sirens, etc.). **A3 must not ship as is.**
- **Q1 AAA QA audit: done.** Four reports in `docs/qa/2026-10-13-QA-{A,B,C,D}-*.md`, each spot-verified by the architect. Fix waves:
  - **F1** player/audio: ✅ **accepted**. All 6 P1s fixed, plus P2-1–4, P2-8–12, P2-14, P2-17–18 and the P3s.
  - **F2** UI/a11y, **F3** data integrity (alias spoiler leak, playability, stale translations, ledger, storage, keep paid passages, PDF cap) and **F4** performance (catalogue snapshot writes, DOM re-parsing, N+1 queries, lazy extraction stack): queued after N3 lands, because they overlap its files.
  - **L1 listening model** (per-chapter resume, bookmarks, speed per series): **user-approved 2026-10-13**, the only bigger jump approved for now. Brief `docs/briefs/L1-listening-model.md`; it runs after N3 and F1. The others (gapless media session, real sentence timing, checkpoints, sound packs) are **not approved yet**.
  - Architect size decision: A4 beds are encoded at 48 kbps (24 MB budget).
- APK `lectio-0.1.0-23ac9d0-arm64.apk` is with the user. They report it is quicker, but that a chapter sometimes stays stuck on Narrating after they leave the app (→ N3).

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

## 2026-10-11 evening: user requests (1 and 2 done; 3 blocked)
1. ✅ **Play crash fixed** (c3eac7a → 4320fd6): the scrubber's UI-thread worklets called plain JS helpers ("Tried to synchronously call a Remote Function"). The helpers are now worklets, declared before use. New `npm run worklet:check` (in `verify`) catches the whole class.
2. ✅ **N1: three narrator options from the start** (63a0b8c): Gemini Flash Lite (Best quality, ~$0.55/h, all languages), Kokoro 82M (Budget, ~$0.03/h, 8 languages: en, es, fr, hi, it, ja, pt-BR, zh) and Fish Audio S2.1 Pro free (Free, $0, rate-limited per minute and per day). The cards appear in onboarding (new step 2, "Choose your narrator") and in Settings → Narration, with live prices, language support, a disabled state for unsupported languages, and Preview.
   - Format self-heal for mp3, pcm and wav. A daily free limit maps to a non-retryable `RATE_LIMITED` error with the copy "switch to Budget". Segment size per narrator: Gemini and Kokoro 600, Fish 1,800.
   - **Language guard**: the narrate stage refuses before any paid request when the narrator can't speak the chapter's language, with the error "The Budget narrator can't read German. Choose Best quality or Free in Settings → Narration, then retry." It is mutation-checked.
   - Evidence: `npm run verify` gives 182 suites, 1,738 tests, lint 0, typecheck, worklet:check OK, bundle OK. `boot:check` OK.
   - **Unverified without a live call** (no key here): whether Fish free accepts a request with no voice, its actual output format, and its daily-limit headers or wording. Kokoro voice quality per language. On-device check wanted.
   - Known open item: the narrate concurrency orphan file when one segment of a pair fails (harmless, as the file is overwritten on retry).
   - **APK delivered**: `lectio-0.1.0-63a0b8c-arm64.apk` on branch `apk-builds` (bc2ca55), 45,770,786 bytes, SHA-256 `182ba146…60fa`, the same debug signing key (`fac61745…3b9c`), 10 permissions, Hermes bundle checked for the new strings, and the GitHub blob `a7d2bc35` matches the local file.
3. ⛔ **A3: Freesound real ambience is BLOCKED by network policy**: `freesound.org` returns 403 at the proxy. The user must allow `freesound.org` and `cdn.freesound.org` in the environment's network settings (then start a new session). The key is stored outside the repo at `~/.config/lectio/freesound.key` (mode 600); this container is ephemeral, so the next session may need it re-supplied as an env secret (`FREESOUND_API_KEY`). The brief is ready: `docs/briefs/A3-freesound-ambience.md`.

## Incident 3: narration stops and starts like a scratched CD (2026-10-11 night), fixed in 254fbad
- **Symptom (user):** playing a chapter, the AI voice keeps stopping and starting, chopped up.
- **Root cause (architect, from the native sources of both libraries):** the app had **two audio-focus clients**. `native-engine.ts` subscribed to interruptions through react-native-audio-api's `AudioManager.observeAudioInterruptions(true)`, which on Android *requests* `AUDIOFOCUS_GAIN` (`AudioAPIModule.kt` → `AudioFocusListener.requestAudioFocus`). expo-audio requests `AUDIOFOCUS_GAIN_TRANSIENT` on every `play()` and abandons focus whenever no player is playing (`AudioModule.kt`, `onPlaybackStateChange`). The loop: voice plays → audio-api loses focus → interruption `began` → the engine pauses the voice → expo-audio abandons focus → audio-api regains it → `ended` with `shouldResume: true` (transient loss) → the engine plays → and again. It also started on any momentary stop (segment swap, seek, buffering).
- **Fix:** expo-audio is the only focus client. It already pauses on focus loss and resumes after a transient one, and the engine follows through the voice snapshots. The native engine no longer listens through react-native-audio-api.
- **Regression test:** `src/audio/native-engine.test.ts` fails if anything asks react-native-audio-api for focus (mutation-checked: it fails on the old code, `Expected number of calls: 0, Received: 1`). A second test checks the engine follows a native pause and resume without re-issuing play or pause.
- **Evidence:** `npm run verify` exit 0 (183 suites, 1,740 tests, lint 0, typecheck, worklet:check OK, bundle OK). `npm run boot:check` OK.
- **Device check wanted (S1):** a 10-minute listen across several segment boundaries; a phone call mid-chapter (the voice pauses and resumes); another music app started mid-chapter (the voice pauses).
- **Noticed, not changed (backlog, user-visible):** ambience beds keep playing while the voice is paused, and 7 dB louder because ducking releases. They also keep playing through a phone call. Proposed: beds follow the transport (fade out on pause, error or end; fade back in on play; keep them through buffering), with a ~350 ms grace so segment swaps don't flicker them.
- **Noticed (S1):** expo-audio 57 asks for `AUDIOFOCUS_GAIN_TRANSIENT`, not long-term `GAIN`, and drops focus at every momentary stop. With another music app paused in the background, that app may resume for a moment at each segment swap. If S1 shows it, the fix is a single-player playlist or a patch to expo-audio's focus type.

## Freesound, 2026-10-11 night
- The user reports full internet access now and supplied the key again. It is stored outside the repo at `~/.config/lectio/freesound.key` (mode 600) and is never written to the repo.
- Every `freesound.org`, `cdn.freesound.org` and `labs.freesound.org` URL still returns **403**. This is **Freesound refusing this cloud IP, not our network policy**: the proxy passes the tunnel through, the TLS certificate is Freesound's own (Let's Encrypt, not the proxy's interception CA), and the 403 has an empty body and no server header. Other hosts (example.com, Openverse) work.
- Reachable alternative: **Openverse** (`api.openverse.org`) indexes Freesound's CC0 catalogue (240 CC0 results for "rain", with author, licence and landing URL). But its audio URLs point at `cdn.freesound.org`, so the files still can't be downloaded from here.
- Options for the user: (a) run the A3 download step on their own computer (a residential IP), then push the files; (b) use other CC0 sources reachable from here (Wikimedia Commons public-domain/CC0 field recordings; quality varies); (c) keep the procedural pack for now.

## 2026-10-12: user report and requests
- **Bug:** a Chinese chapter ("Ascending Jade Palace", ch. 1) failed at **narrate** with "OpenRouter is having trouble right now" (a 5xx after 3 retries). **Diagnosis:** TTS segments are cut at 600 chars for every script, and 600 Han chars is ~240 s of audio in one request, which runs into upstream gateway timeouts. Our 60 s client timeout is also too short for that. → N2.
- **Slowness:** "even flash models take long". The pipeline is serial: analysis chunks one at a time, translation at concurrency 1, narration at 2, and first audio waits for full analysis and translation. → N2 (parallelism + stage timings in Diagnostics). Streaming and stage reordering is Phase 2 and needs an ADR.
- **Requests:** keep researching and building real ambience from many sources (→ R5, then an implementation brief). Explore character voices and intonation independent of the TTS model (→ R6, feasibility first).

## N2 accepted (2026-10-12)
- **What it changed:**
  - TTS segments are sized by **speech seconds** (Best/Budget 40 s, Free 120 s; first segment 12 s). Chars stay as an upper bound.
  - Timeouts: speech 180 s, chat 120 s (per-request override in the transport).
  - **Split-and-join fallback**: a stubborn passage of 2+ sentences that fails with a retryable error is spoken as two halves, then joined (`joinWav`/`joinMp3`).
  - Narrate failures now name the passage: "didn't answer for passage N of M… Tap Retry".
  - Concurrency 3 for analysis chunks, translation and narration (Free narrator: 1), through an **ordered pool** that still saves and streams segments in order.
  - Diagnostics gets a **"Recent chapters"** block: stage durations, segment count, audio seconds.
- **Plans** (from the fixture passages):
  - 600-char Mandarin passage: 3 segments of 52–83 s before, 8 segments of ≤ 36 s after (first 6.8 s).
  - 600-char English passage: 2 segments (47.6 s + 4.8 s) before, 3 segments (8.4 s + 39.2 s + 4.8 s) after.
- **Evidence:**
  - Worker: 24/24 mutation checks caught.
  - Architect re-ran typecheck, lint (excluding A3's in-progress scripts), worklet:check and jest (190 suites, 1,825 tests), all green.
  - Architect's own mutation check: the seconds budget removed gives 11 failures; restored, 66/66 pass.
- **Accepted trade-off:** with translation concurrency 3, a chunk whose previous chunk is still in flight sees that chunk's source text but not its translation. The glossary keeps names consistent. Check quality on a real chapter.
- **Phase 2 (needs an ADR):** stream translation into narration, or reorder stages, so first audio doesn't wait for full analysis and translation. Keep segments finished after a failure.
- **Backlog:** after a translate failure, in-flight chunk calls may still record usage. `src/core/async/` is a new core folder; add it to CONVENTIONS.
- **R5 done** (`docs/research/R5-ambience-sources.md`):
  - In-app redistribution is clear for Freesound CC0, BigSoundBank (only files labelled CC0) and OpenGameArt (only files labelled CC0).
  - ElevenLabs SFX is the only AI option that loops (paid plan).
  - OpenRouter has no SFX model.
- **R6 done** (`docs/research/R6-character-voices.md`):
  - Feasible. Phases: P1 delivery directions → P2 narrator + 2–4 voices (Gemini 2-speaker) → P3 full cast.
  - Prerequisites: hash-keyed resume, and a planner change for dialogue paragraphs (needs a listening test).
  - Live risk: the app sends `speed` to every model. Probe it.

## A3 built (2026-10-12), pending the user's ears
- **18 real CC0 Freesound beds**:
  - weather: light/heavy rain, rain on window, storm
  - nature: forest by day and night, ocean, river, open field, mountain wind
  - urban: city by day and night, market
  - interiors: cafe, tavern
  - transport: train, horse trot
  - combat: war drums

  Each is a 60 s seamless loop at −28 LUFS, AAC 64 kbps mono, about 495 KB. The real pack is 8.94 MB (budget 15 MB); with the base pack, about 11.9 MB of ambience is bundled.
- **Tooling**: `npm run sounds:curate` / `sounds:build-real` / `sounds:test`. `verify` now also runs `sounds:test` and `sounds:verify`. Licence gate: exactly CC0, re-checked at build. Every file has a row in `LICENSES.json`. To replace a bed, set `assets/ambience/curation/overrides.json` and run `npm run sounds:build-real -- --only=<id>`. The key is read from the env and sent as a header only; a grep finds it in 0 repo files.
- **App**: `ambience-pack.ts` requires the 18 real beds. `resolve-bed` prefers the exact real bed before the fallback chain (tests added).
- **Evidence**: architect re-ran `npm run verify`, exit 0 (191 suites, 1,839 tests, `verify-pack: all checks passed`, sounds:test 39/39). Worker mutation: removing a require fails 4 tests.
- **Risky beds to listen to first**:
  - horse_trot: hoof rhythm at the seam
  - war_drums: may be music
  - storm_wind: has sirens
  - heavy_rain: thunder
  - market_crowd: only 3 ratings
  - tavern and cafe: voices by design
- **Backlog**:
  - The A1 seam rule is lenient for rhythmic beds (a per-bed p99 limit).
  - Diagnostics' audio probe now decodes 24 beds (measure the time).
  - The 6 AI-generated beds from R5 (fireplace, castle hall, battlefield, gallop, ship deck, temple) need an ElevenLabs paid plan: the user's decision.

## F1 accepted (2026-10-13)
- **Fixed:**
  - Auto-advance no longer bounces back, and it **autoplays** the next chapter (architect confirmed: audiobook norm).
  - Beds follow the transport: a 350 ms debounce then a 600 ms fade, ducking only while the voice plays, the context suspended ~2 s after silence, and the sleep fade covers the beds.
  - Settings drive ambience: one range, `core/playback/ranges.ts` (level −40…0, ducking 0…24, default 7).
  - The playback error state with resume.
  - `final` only on ready/failed, with a "Narration paused" end state.
  - One sample output, which pauses and resumes the narration.
  - Load sequence and dispose guards; seek before the segment is ready is kept.
  - Decoded-bed cache sized by bytes (48 MB).
  - 4 Hz render isolation.
  - Follow fallback in the synced text.
  - Predictive repeat.
  - Copy per error cause.
  - Screen-reader actions.
  - Sleep ticker and "Sleep fading out".
  - Preview cache capped at 20.
  - Dead interruption path deleted.
  - ADR-0002 amendment: `doNotMix` kept.
- **Evidence:**
  - Worker: mutation checks on P1-1/2/3/5 and P2-1/3/4.
  - Architect: typecheck green; F1 scope lint clean; 45 suites, 398 tests green; reverting `app/player.tsx` fails `player-route` (1 failed), restoring it gives 2/2.
- **Open:**
  - `estimate.test.ts` fails (N3's area; it predates F1).
  - P2-10 needs a profiler on a device.
  - `.cache/` added to the eslint ignores (the A4 venv).

## N3 accepted (2026-10-13)
- **Built:**
  - **Connection epochs** (`src/services/network/`): returning to the app retires requests whose socket died while frozen. They retry at once and don't count against retries.
  - **Stall watchdog** (`core/pipeline/stall-watchdog.ts`): 90 s plus the request's timeout. After 3 stalls the chapter fails with resumable copy, and saved passages are kept.
  - "Narrating · passage N of M", elapsed time after 30 s, "Reconnecting…".
  - A one-time background notice.
  - Diagnostics: last activity, stalls, stale aborts.
  - Migration `0003` (`stage_activity`, cascades with its chapter).
- **Time from the user's return to the retry**: up to ~110 s before (a stuck passage could hold a chapter for ~21 min), 0 ms after.
- **Architect change: freeze detection by heartbeat.** The app beats every 1 s, and a request is retired only if the beats stopped for more than 10 s (a real freeze). A short trip away (the notification shade), or a background stretch while N4's foreground service keeps JS alive, no longer retires live, possibly already-billed requests. A gap the heartbeat sees itself retires at once, even in the background. Tests added; mutation (always retire) → 3 failures; restored 14/14.
- **Evidence (architect)**: typecheck green; full jest 2,012/2,013. The 1 failure is `estimate.test.ts`, whose expected cost moved with A4's prompt and taxonomy change; A4 must update it. Lint failures remain only in A4 in-progress files.
- **For N4**: while the foreground service runs, the watchdog must keep running in the background (today it is suspended in the background).

## N4 + L1 accepted (2026-10-14)
### N4: background preparation
- **Built:**
  - Plugin `plugins/with-background-processing.js`: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC` and `POST_NOTIFICATIONS`; dataSync type on the library service; a monochrome `ic_stat_lectio` icon. The scratch prebuild shows the lines.
  - Runner `src/services/pipeline/background-runner.ts`: starts in the foreground when the queue has work and stops when it is idle or paused. The notification shows the chapter title and step, with a progress bar, throttled to every 2 s; a tap opens `lectio://`.
  - A start failure degrades to keep-awake plus the notice.
  - The watchdog keeps counting in the background while the service is alive.
  - A one-time permission sheet.
  - Diagnostics probe `background-service`.
- **Architect fix:** the service task is now released only by the runner's stop. Before, it awaited `queue.idle()`, which can settle at once when the drain hasn't started; the library then stops the service on task end without telling JS, so the runner believed it was running. New test; mutation (the old task) → 1 failure; restored 18/18.
- **Open:**
  - Settings copy for turning notifications on (in the settings area).
  - One source for the stage verbs (`chapter-status.ts` vs the notification copy; a parity test guards it for now).
  - A designer icon.
  - Android 15 `onTimeout` stops the service silently (the heartbeat covers the later freeze).
- **Device checks:**
  - The notification appears and updates.
  - 10 min with the screen off.
  - Permission denied.
  - A tap on the notification opens the library.
  - The merged APK manifest.

### L1: listening model
- **Built:**
  - Migration `0004`: `chapter_positions`, `bookmarks` (one per sentence), `series.playback_rate`. The backfill computes media time from the segments.
  - Per-chapter resume. A finished chapter restarts, and is marked unfinished after 5 s.
  - Row progress bar, "12 min left", "Finished", and a "Now" pill.
  - Bookmarks: transport button, sentence action, sheets on the player and series screens, notes, swipe or accessibility-action delete.
  - Speed per series, plus Settings → Playback default speed.
  - The furthest point (the spoiler cutoff) still only moves forward.
- **Evidence:**
  - Worker: full jest 2,162 green; starred mutations caught.
  - Architect: typecheck and lint green, 69 suites and 514 tests in scope, and the migration SQL reviewed. Mutation: resume returning 0 → 3 failures; restored 47/47.
- **Open:**
  - Device checks: swipe, sheet scroll, slider.
  - A light-theme contrast pass.

### Tree status (architect, after N4 + L1)
- typecheck and lint green
- jest 229 suites, 2,163 tests green
- boot:check OK
- Only `sounds:verify` fails, in A4's in-progress work.
