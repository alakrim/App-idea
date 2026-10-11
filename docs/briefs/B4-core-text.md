# Brief B4: Core text engine (segmentation, chunking, timing)

**Type**: implementation, pure TypeScript in `src/core/text/`. Read `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/specs/domain.md` (the Text and Narration sections), `docs/decisions/0004-extraction-pipeline.md` (point 7) and `docs/research/R3-content-extraction.md` (the segmentation section).

## Why it matters
The sentence is the spine of the app. Ambience cues, translation alignment, TTS segments, the karaoke highlight and the spoiler cutoff all hang on sentence indices. Bad splits mean a bad product.

## Scope
1. `normalize.ts` (extend the existing one): Unicode NFC, unify whitespace and line breaks, strip zero-width chars and soft hyphens, normalize quotes only where unambiguous, collapse ≥3 newlines, and trim. Never alter CJK punctuation. Add `detectScript(text) → 'latin'|'cjk'|'cyrillic'|'arabic'|'thai'|'other'` by majority codepoint ranges.
2. `paragraphs.ts`: `toParagraphs(text) → {text, kind}[]`. Split on blank lines (or single newlines for CJK and novel-style text where each line is a paragraph). Classify `heading` (short, no terminal punctuation, Title-ish or 第X章 / Chapter N patterns), `dialogue` (starts with a quote mark: " " « 「 『 — ), `quote` and `text`.
3. `segment.ts`: `segmentSentences(paragraph, lang?) → string[]`
   - **Strategy**: use `Intl.Segmenter(lang, {granularity: 'sentence'})` when it is available *and* the script is not CJK (ICU over-splits some CJK dialogue). Otherwise use our rule-based splitter. Feature detection must be injectable for tests.
   - Rule-based Latin: split on `.?!…` followed by space and an uppercase letter or quote; protect abbreviations (Mr. Mrs. Dr. St. vs. e.g. i.e. etc., Sr. Sra., single initials "J. K."), decimals, ellipsis inside quotes, and URLs.
   - Rule-based CJK: split after `。！？!?…` plus any closing quotes/brackets `」』"）】`; keep a closing quote attached to its sentence; never split inside 「…」 unless the inner text contains a sentence end followed by more text in the same quote longer than 40 chars.
   - **Merge** fragments shorter than 2 chars (CJK) or 3 words (Latin) into the neighbouring sentence. **Split** sentences longer than 400 chars at the best secondary break (`;`, `:`, `，`, `、`, `,`), so TTS chunks and highlights stay usable.
4. `build.ts`: `buildChapterText(rawText, lang?) → { paragraphs: Paragraph[], sentences: {idx, paragraphIdx, text, charCount}[] }` with stable 0-based indices and `sentenceStart`/`sentenceEnd` per paragraph.
5. `chunk.ts`:
   - `planTtsSegments(sentences, {maxChars = 600, minChars = 120}) → {sentenceStart, sentenceEnd}[]`: greedy within a paragraph, never crosses a paragraph *unless* the paragraph is tiny (< minChars) and the next one is also text. Headings get their own segment. A single sentence longer than maxChars is its own segment.
   - `planLlmChunks(sentences, {maxTokens, overlapSentences}) → {start, end}[]` for map-reduce analysis/translation, using a token estimator `estimateTokens(text)` (Latin ≈ chars/4, CJK ≈ chars × 1.0, others chars/3; documented as a heuristic).
6. `timing.ts`: `estimateSentenceOffsets(sentenceTexts, totalDurationMs) → number[]`. Weight by spoken length: Latin by chars excluding punctuation plus a pause bonus for terminal punctuation (≈ 8 char-equivalents) and commas (≈ 3); CJK by characters. The offsets are monotonic, the first is 0, and all are < total. Add `sentenceAt(offsets, positionMs) → index` (binary search).
7. Tests with real fixtures in `src/core/text/__fixtures__/`: English prose with abbreviations and dialogue, Italian, Brazilian Portuguese, Simplified Chinese web-novel text with 「」 and “”, Japanese with 「」, and Korean. Minimum 40 meaningful test cases, including property-style tests (concatenating the sentences equals the paragraph text modulo whitespace; offsets are monotonic).

## Constraints
- Pure TS. No dependencies beyond what is installed. Do not run `npm install`.
- Only touch `src/core/text/**`.

## Acceptance
`npm run typecheck`, `npm run lint` and `npm run test:core` pass (paste the tails). The report includes 3 sample segmentations (EN, ZH, JA) printed from the fixtures.
