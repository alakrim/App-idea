# Brief N2: Narration reliability and speed

**Type**: implementation (core + services + one diagnostics view). Read `CLAUDE.md`, `docs/CONVENTIONS.md` (including the React Compiler and Worklets rules), `docs/STATE.md` (incident 3 and the 2026-10-12 section), ADR-0003, then: `src/core/pipeline/stages/{narrate,analyze,translate}.ts`, `src/core/pipeline/runner.ts`, `src/core/narration/{options,formats}.ts`, `src/core/text/{chunk,speech-rate}.ts`, `src/core/analysis/map-reduce.ts`, `src/core/translate/translate-chapter.ts`, `src/services/openrouter/{client,transport,speech,error-mapping}.ts`, `src/services/pipeline/adapters/tts.ts`, `src/features/diagnostics/*`.

## Why (user report, 2026-10-12)
1. A Chinese chapter (source: a Taiwanese web novel) failed at the **narrate** stage with "OpenRouter is having trouble right now. Try again shortly." (a 5xx after the transport's 3 retries).
2. "Even with flash models, chapters take long to generate."

**Architect's diagnosis.** TTS segments are cut by **character count** (Gemini and Kokoro 600, Fish 1,800), the same for every script. Speech density differs a lot (`speech-rate.ts`: Latin 9.2 chars/s, Han 2.5, Japanese 4.2). A 600-char Han segment is **~240 s of audio in one request** (Latin: ~65 s). Long syntheses run into upstream gateway timeouts (5xx) and our own 60 s client timeout, and every retry repeats the whole long request. On top of that the pipeline is serial: analysis chunks run one after another, translation runs with concurrency 1, and narration with 2. The first audio waits for all of analysis and translation.

## Scope
1. **Segments sized by speech time, not characters** (`src/core/text/chunk.ts`, `src/core/narration/options.ts`, `narrate.ts`):
   - `TtsPlanInput` gets an optional `seconds` (estimated speech seconds, from `estimateSpeechSeconds(text, lang)`). `planTtsSegments` gets `maxSeconds` and `firstMaxSeconds`. A segment closes when adding the next sentence would exceed `maxChars` **or** the seconds budget. The first segment uses `firstMaxSeconds`. A single sentence over budget still gets a segment of its own (existing rule).
   - Each narrator option gets `segmentMaxSeconds`: Best quality (Gemini) **40**, Budget (Kokoro) **40**, Free (Fish) **120** (fewer requests means fewer rate-limit hits). `firstMaxSeconds` is **12** for all three, so playback starts quickly. Keep `segmentMaxChars` as an upper bound.
   - Use the **spoken language** (translation target, else source) for the rate. Check the result: a 600-char Han passage now becomes about six segments of about 100 chars, and an English passage of the same length about two.
   - Changing segment boundaries changes segment hashes, so existing chapters re-narrate only when the user retries or re-runs. That is fine. Add no migration.
2. **Timeouts that fit the work** (`client.ts`, `transport.ts`, `speech.ts`):
   - Support a per-request `timeoutMs` override in the transport.
   - Speech uses **180 s**. Chat/JSON calls keep the client default, which goes from 60 s to **120 s** (analysis prompts are ~5k tokens).
3. **Split-and-join fallback for one stubborn segment** (`narrate.ts`): when `tts.synthesize` for a segment of **two or more sentences** still fails with a *retryable* failure (5xx `UNKNOWN`, or `NETWORK` timeout) after the transport's retries:
   - split it at the sentence boundary nearest its midpoint
   - synthesize both halves, once each (no further recursion)
   - join them into one file, keeping the segment's index and sentence range. WAV: one header, the PCM data concatenated, and both halves must have the same rate and channels. MP3: byte concatenation of the frames, the ID3 tags of the second half stripped.
   - if the halves come back in different containers, or either half fails, throw the original failure
   - put the join helpers in `src/core/narration/formats.ts`, pure, with tests (`joinWav`, `joinMp3`)
4. **Clear failure copy for narration**: when the narrate stage finally fails on a retryable OpenRouter error, rethrow as a `StageFailure` with the same code and `retryable: true`, and the message **"The narrator service didn't answer for passage N of M. Your progress is saved. Tap Retry to continue."** Keep the upstream detail in `detail`. Retry already resumes at the first missing segment: add a test proving no finished segment is re-synthesized.
5. **Speed: run independent calls in parallel**:
   - `analyzeChapter`: run chunk calls with **concurrency 3**, keeping the responses in chunk order (memory merge depends on order). Cancellation must still stop new calls.
   - Translate stage: pass **`concurrency: 3`** to `translateChapter` (it already supports it).
   - Narrate: concurrency per option, `narrateConcurrency`. Best quality 3, Budget 3, Free 1 (free models are rate-limited per minute). Segments must still be **saved and emitted in index order**, so playback can stream: a finished later segment waits for the earlier ones. Keep or adapt the batch loop, but do not leave a slot idle while a slow segment holds up a whole batch. Use a small ordered work pool.
6. **Measure where the time goes** (Diagnostics): check that the runner writes `startedAt`/`finishedAt` on job rows (fix if not). The Diagnostics report adds a "Recent chapters" block: for the last 5 chapters, each stage's status and duration in seconds, plus segment count and total audio seconds. With that, the user's next report shows which stage is slow.

## Out of scope (Phase 2, needs an ADR)
Reordering stages or streaming translation into narration (first audio before the whole chapter is translated or analysed). In your report, note what you would change, but do not implement it.

## Tests (mutation-check the important ones: make them fail by reverting the fix, then restore)
- seconds-based planning: Han vs Latin, first-segment budget, single long sentence
- option values
- per-request timeout (speech 180 s)
- split-and-join: WAV join (header lengths correct, duration = sum), MP3 join (ID3 stripped), fallback taken only for retryable failures and ≥ 2 sentences, original error rethrown when a half fails
- narrate failure message with N of M
- resume after failure re-synthesizes nothing that was done
- analysis concurrency keeps order
- ordered pool emits in index order with concurrency 3
- diagnostics stage timing block

## Constraints
No real API calls (no key here, so mock the network). Do not run `npm install`. Do not commit. Don't touch `src/audio/**`, `src/features/player/**`, `index.js` or `plugins/**`.

## Acceptance
`npm run verify` is green (paste the tail). The report gives:
- the segment plan (count and seconds per segment) for a 600-char Chinese passage and a 600-char English passage, before and after
- the mutation-check results
- the Phase 2 note
