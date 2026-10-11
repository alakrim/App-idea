# Brief P2: Pipeline services (real ports + real facade): the end-to-end slice

**Type**: implementation (app services + integration). Read `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/ARCHITECTURE.md`, ADRs 0003, 0004 (including the PDF amendment) and 0006, the **P1 notes** in `docs/STATE.md`, `src/core/pipeline/ports.ts` (the contract), `src/core/pipeline/{runner,queue,estimate}.ts`, `src/features/pipeline/{facade,fake-facade,pipeline-provider}.ts(x)`, `src/services/openrouter/index.ts`, `src/services/{storage,secrets}.ts`, `src/app-shell/*` and every repo in `src/db/repos/`.

## Goal
Replace the fake facade with the real one, so that **pasting a URL in the app creates a chapter that gets extracted, cleaned, analyzed, translated, narrated and becomes playable**, with live progress, cost metering and resumability.

## Scope
1. **Adapters** (`src/services/pipeline/adapters/*.ts`), one per port:
   - `ChapterStore`:
     - Back it with the existing repos (`chapterRepo`, `seriesRepo`, `textRepo`, `cueRepo`, `memoryRepo`, `audioSegmentRepo`, settings).
     - **Reuse them, don't duplicate SQL.** If a repo function is missing, add it to that repo with a test.
     - `narration`: upsert a `narration_profiles` row from `settings.narration` (stable id per (provider, model, voice, style, speed)).
     - `setTranslations` stores `translated: null` for `partialIdx`.
   - `JobStore` uses `jobRepo` plus a `settings` key `pipelineQueue` storing `{chapterId, from?, force?, pdfEngine?}[]`, so the run options persist (P1 open issue 7). Extend the core queue minimally if needed.
   - `UsageLedger` → `usageRepo`.
   - `Fetcher`: `fetch` with a desktop-class mobile UA string, `redirect: 'follow'`, streaming size enforcement (5 MB) and a timeout. Reject non-HTML/text content types with a clear error.
   - `WebViewExtractor`: a **hidden WebView host** component (`src/services/pipeline/webview-host.tsx`, mounted once in the app shell, offscreen, `pointerEvents="none"`).
     - It loads the URL with JS enabled, waits for `load` + 1.5 s of network idle (or a max of 12 s), then posts `document.documentElement.outerHTML` back via `postMessage`.
     - Sandbox it: no file access, `originWhitelist` http/https only, no injected bridge beyond the single message, third-party cookies off, and an incognito/private mode if supported.
     - Requests are queued one at a time and are cancellable.
   - `PdfTextSource`: read the file as base64 (expo-file-system) → `openrouter.parsePdf` with the engine. **Split pages**: request the parser output with page delimiters if it provides them; otherwise split on form-feed or the page markers it emits. Document what the `cloudflare-ai` engine returns, and if pages cannot be recovered, return `pages: [text]` and note it.
   - `Tts` → `openrouter.synthesizeSpeech` (mp3).
   - `AudioFiles` → storage `audio/<chapterId>/<idx>.mp3`. Also **delete files at index ≥ n** when the segment count shrinks (P1 open issue 5).
   - `LlmPort.transportFor(model)` → a transport v2 adapter over `chatJson`/`chatText`. It passes `jsonSchema` as `response_format` and the signal, and returns the real usage. Since `chatJson` validates with zod but the core already validates, add a lower-level `chatRaw({model, system, user, jsonSchema?, signal})` to the OpenRouter client that returns `{text, usage}` (structured output + usage accounting, no zod), with tests.
   - `Catalog` → `models.list()` (text + speech), mapped to `CatalogModel` with `supportsStyle` (true for models whose id contains `gemini` and `tts`, plus any whose `supported_parameters` includes `instructions`; document the heuristic).
   - `Clock`, `IdGen`.
2. **Real facade** (`src/services/pipeline/facade.ts`) implementing `PipelineFacade`:
   - `previewUrl`: fetch plus `extractArticle` locally (no paid calls) → `SourcePreview` (quality mapping: accept→good, llm_select→needs_ai, webview→needs_render, empty→empty). Detect `nextChapterUrl` from `rel=next` or link text in the nav lexicon (reuse `src/core/extract/lexicon.ts`).
   - `estimate` → `estimateChapterCost` with the catalog and settings.
   - `createChapter`: insert the row (status `draft`). Copy the PDF into `sources/<chapterId>/`, or save the text via `saveSourceText`.
   - `enqueue`/`cancel`/`retry`/`retryWithOcr` → the core queue + runner.
   - `subscribe`: maintain an in-memory `ChapterProgress` per chapter from runner events (stage weights for `overall`: extract .1, clean .05, segment .02, analyze .18, translate .25, narrate .40; renormalize when stages are skipped), and seed it from the job rows when there is no live run.
3. **Lifecycle**:
   - Swap `pipeline-provider.tsx` to the real facade (the fake stays for tests and web).
   - Resume the persisted queue at boot.
   - `expo-keep-awake` (installed) while a run is active.
   - A local notification on completion is **out of scope** (no expo-notifications yet). Instead, show an in-app toast "Chapter ready" when the app is foregrounded.
   - Pause the queue when the API key is missing (`AUTH`) and show the "Connect OpenRouter" toast with an action.
4. **Player hook-up**: when the narrate stage emits `segmentReady` for the chapter that is currently loaded in the player, the facade's progress (`readySegments`) must update, so U3's controller appends segments. Verify against U3's `playback-controller.ts` API.
5. **Integration test** (Node, `src/services/pipeline/e2e.test.ts`) using a real in-memory SQLite (`better-sqlite3` + real migrations, the same fixture as the repo tests), real core, and fake network:
   - mock fetch returns a fixture HTML page (reuse `src/core/extract/__fixtures__`)
   - a mock OpenRouter returns canned analysis/translation JSON and tiny valid MP3 bytes (build one CBR frame sequence in the test)
   - enqueue a URL chapter, run to `ready`, and assert:
     - sentences
     - cues
     - memory
     - entities
     - translations
     - audio segment rows with durations
     - files written
     - usage rows
     - job rows
     - progress events monotonic
   - cancel/resume mid-narrate
   - voice change regenerates only narrate
6. Fix the JSON-parse duplication (P1 open issue 3): make `src/core/extract/select.ts` and `src/services/openrouter/json.ts` use `src/core/llm/json.ts`.

## Constraints
- Do not run `npm install`. Do not commit. No paid calls (all tests mock the network).
- Ownership: `src/services/pipeline/**`, `src/features/pipeline/pipeline-provider.tsx`, missing repo functions (in their repo files) with tests, `src/services/openrouter/{client,chat,json,index}.ts` (for `chatRaw` + dedupe), `src/core/extract/select.ts`, minimal queue extension in `src/core/pipeline/queue.ts`, and one line in `app/_layout.tsx` to mount `WebViewHost`. Report every cross-boundary edit.

## Acceptance
`npm run verify` is fully green (paste the tail). The e2e test passes. The report includes the event trace of the e2e run (stage → status, costs) and the measured total for the test chapter.
