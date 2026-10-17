# src/core/text

Purpose: turn a chapter's raw text into sentences, paragraphs and the segments that TTS and LLM calls use. Indices are sentence indices.

**Layout**
- `build.ts`: `buildChapterText()`, paragraphs and sentences. `segment.ts`, `rule-split.ts`, `abbreviations.ts`, `fragments.ts`: sentence splitting, CJK and abbreviation rules, short and long fragment repair.
- `paragraphs.ts`, `normalize.ts`: paragraph kinds (text, heading, quote, dialogue), whitespace and script detection.
- `chunk.ts`: `planTtsSegments()` and `planLlmChunks()`, the character and token budgets.
- `timing.ts`, `speech-rate.ts`, `word-count.ts`: sentence time offsets, speech estimates by script, word counts.

**Entry points:** `build.ts` `buildChapterText()`; `chunk.ts` `planTtsSegments()`, `planLlmChunks()`; `timing.ts` `sentenceAt()`.

**Gotchas:** ranges are inclusive at both ends. CJK has no spaces, so count characters, not words. Speech rates are measured constants: change them only with new measurements (`speech-rate.ts`).

**Tests:** `*.test.ts` beside each file, run with `npm run test:core`. Real-world samples (EN, IT, PT, ZH, JA, KO) are in `__fixtures__/`.
