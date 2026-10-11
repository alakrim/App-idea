# Brief P1: Pipeline core (orchestrator, stages, cost preview)

**Type**: implementation, pure TypeScript in `src/core/pipeline/` and `src/core/llm/`, plus migrations inside `src/core/analysis` and `src/core/translate`. Read `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/ARCHITECTURE.md` §2–3, `docs/specs/domain.md` (Pipeline, Narration), **ADR-0003, 0004 and 0006**, then the public APIs of `src/core/{text,extract,analysis,translate,memory}` and `src/services/openrouter/index.ts` (for shapes only; core must not import services).

## Goal
Given a chapter id, run **extract → clean → segment → analyze → translate? → narrate** end to end, resumably, with progress events and real cost accounting. All I/O goes through injected **ports**, so this is fully testable in Node with fakes. A later brief (P2) implements the ports with the real DB, OpenRouter, the file system and a WebView.

## Scope
1. **LLM transport v2** (`src/core/llm/`) per ADR-0006 §4:
   - `transport.ts`: `LlmTransport = (req: {system, user, jsonSchema?: {name, schema: object}, signal?}) => Promise<{text, usage: {promptTokens, completionTokens, costUsd: number|null}}>`
   - `json.ts`: the shared `stripCodeFence` and tolerant JSON parse
   - Migrate `src/core/analysis` and `src/core/translate` to v2:
     - pass the `z.toJSONSchema(..., {io:'output'})` schema
     - accumulate the real `usage` (sum it, including repairs)
     - pass `signal` through
     - delete the duplicated fence helpers
   - Per ADR-0006 §2, describe the analysis cue items fully in the output schema (nullable fields) instead of `z.unknown()`.
   - Update the tests.
2. **Ports** (`src/core/pipeline/ports.ts`), as precise TypeScript interfaces:
   - `ChapterStore`: get the chapter + series (+ settings snapshot), set status, set title/lang/wordCount, `replaceText(paragraphs, sentences)`, getSentences, `setTranslations(map, partialIdx)`, `saveCues`, `saveMemory`, `getPriorMemories(seriesId, beforeOrder)`, `getEntities(seriesId)`, `applyEntityResolution(...)`, `listAudioSegments`, `saveAudioSegment`, `deleteAudioFrom(segmentIdx)`
   - `JobStore`: get/upsert a job per (chapter, stage), `cancelUnfinished`
   - `UsageLedger`: `record(entry)`
   - `Fetcher`: `fetch(url, signal) → {bytes, contentType, finalUrl}`, with a size cap and a timeout
   - `WebViewExtractor`: `render(url, signal) → html`
   - `PdfTextSource`: `extract({fileUri, engine}) → {text, pages, usage}`
   - `Tts`: `synthesize({text, profile, signal}) → {bytes, mime, costUsd|null}`
   - `AudioFiles`: `write(chapterId, segmentIdx, bytes, ext) → uri`, `remove(chapterId)`
   - `Clock`, `IdGen`
   - `Catalog`: model pricing lookup for cost
2. **Stages** (`src/core/pipeline/stages/*.ts`), each `run(ctx) → StageResult` and idempotent via `inputHash` (FNV-1a or similar pure hash of the stage inputs + model + promptVersion; a `done` job with the same hash means skip):
   - `extract`:
     - URL: fetch, then `extractArticle`.
       - decision `webview`: `WebViewExtractor.render` + `extractFromHtml`, re-gated.
       - decision `llm_select`: the index-selection call through the transport. Record a `clean` job as done/skipped accordingly.
     - PDF: `PdfTextSource` with `cloudflare-ai`. If `< 50 chars/page`, fail with code `CONTENT_EMPTY` and `detail: 'scanned_pdf'`; the UI then offers OCR (mistral-ocr) with a cost confirmation and re-runs with `engine: 'mistral-ocr'`.
     - Text: passthrough.
     - Also strip repeated headers/footers and page numbers from PDF text (lines repeated on ≥ 30% of pages, numeric-only lines).
     - Set the chapter title (extracted title if the user didn't name it), the guessed `sourceLang` (`guessLanguage`) and the `wordCount` (`estimateWordCount`).
   - `segment`: `buildChapterText` → `replaceText`.
   - `analyze`: `analyzeChapter` (map-reduce) with `priorContext` from `buildPriorContext(... strictly before this chapter)` → `validateCues` → `saveCues`/`saveMemory`. Then `resolveEntities` → `applyEntityResolution`.
   - `translate` (skipped when there is no target lang, or target == source): `buildGlossary` (memories ≤ this chapter, including this chapter's glossary) → `translateChapter` → `setTranslations`.
   - `narrate`:
     - `planTtsSegments` over the *spoken* text (translation if present, else original).
     - For each segment in order, run `Tts.synthesize` → `AudioFiles.write` → the duration from **an MP3 frame parser** (`src/core/pipeline/mp3-duration.ts`: parse MPEG audio frame headers including Xing/VBRI, pure, tested with synthesized header bytes) → `estimateSentenceOffsets` → `saveAudioSegment`.
     - Emit a `segmentReady` event after each one (progressive playback).
     - Concurrency 2, saving in order.
     - Resume from the first missing segment.
     - The `style` instruction is passed only if the model supports it.
     - If the narration profile changes, `deleteAudioFrom(0)` and regenerate.
3. **Runner** (`src/core/pipeline/runner.ts`): `runChapter(chapterId, ports, {signal, onEvent, from?: Stage, force?: boolean})`.
   - Runs the stages in order and marks jobs `running` → `done`/`skipped`/`failed` with a `PipelineError`.
   - Updates the chapter status (`processing` → `ready`/`failed`).
   - Emits `{type: 'stage'|'progress'|'segmentReady'|'cost'|'done'|'error'}` events.
   - On abort, marks the job `cancelled` and leaves completed stages intact.
   - Retryable errors get the client's retries. The runner itself does not loop.
   - Changing translation settings re-runs from `translate`. Changing the voice re-runs only `narrate`.
4. **Queue** (`src/core/pipeline/queue.ts`): a serial queue of chapters (one at a time; the user can reorder or cancel), with `enqueue`, `cancel(chapterId)`, a `subscribe` snapshot and persistence through `JobStore` so it resumes after an app restart (`pending` chapters are re-enqueued in order).
5. **Cost preview** (`src/core/pipeline/estimate.ts`): `estimateChapterCost({ wordCountOrChars, sourceLang, targetLang|null, models: {cleanup, analysis, translation, narration}, catalog }) → { perStage: {stage, usd, basis}[], totalUsd, low, high }`, with a ±range from the token heuristics.
   - Analysis output ≈ 900 tokens per chunk.
   - Translation output ≈ input × a language-pair factor table (document the CJK→Latin expansion of ~1.6 tokens).
   - TTS uses `estimateSpeechCost`-equivalent logic (re-implement it in core or move the pure cost math from services into `src/core/llm/cost.ts` and re-export it from services; prefer the move).
6. **Tests** (Node, with fakes for every port):
   - the full happy path for URL, PDF and text inputs
   - the webview fallback
   - the llm_select path
   - resume after a failure at translate (extract/segment/analyze are not re-run)
   - a voice change re-runs only narrate
   - cancellation mid-narrate, then resume from the next missing segment
   - the scanned PDF error
   - usage recorded per call
   - estimate math
   - mp3 duration parsing (CBR + Xing VBR)
   - queue order, cancel and restart-resume

## Constraints
No new dependencies, and do not run `npm install`. Do not commit. Only touch `src/core/pipeline/**`, `src/core/llm/**`, `src/core/analysis/**`, `src/core/translate/**`, and `src/services/openrouter/cost.ts` + `index.ts` only to re-export the moved cost math. Other workers are in `src/audio`, `src/core/playback`, `src/db`, `src/services/{secrets,storage}`, `src/app-shell`, `app/` and `scripts/sounds`.

## Acceptance
`npm run typecheck`, `npx eslint src/core --max-warnings 0` and `npx jest --selectProjects core node` pass (paste the tails). The report lists the port interfaces verbatim and a sample `estimateChapterCost` output for a 5,000-word zh→it chapter with the default models (use fixture pricing in the test).
