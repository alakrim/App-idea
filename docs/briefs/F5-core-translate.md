# Brief F5: Translation engine (pure core)

**Type**: implementation, pure TypeScript in `src/core/translate/`. Read `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/ARCHITECTURE.md` §2–3, `docs/specs/domain.md`, and the existing `src/core/text/chunk.ts`, `src/core/analysis/llm.ts`, `src/core/analysis/schemas.ts` and `src/core/memory/codex.ts` to reuse their patterns.

## Goal
High-quality literary translation that **preserves sentence alignment**: sentence ids go in and the same ids come out. That alignment keeps the bilingual view, ambience cues, timing and the spoiler cutoff working after translation.

## Scope
1. `prompts.ts`: `TRANSLATE_PROMPT_VERSION` and `buildTranslatePrompt({ sentences: {idx, text}[], sourceLang, targetLang, glossary: {term, translation|null, note|null}[], styleNotes: string|null, previousContext: {idx, source, translation}[] /* last ~5 translated sentences for continuity */ })`.
   - A static system prefix, so it is cache-friendly. It says: translate for *listening* (natural spoken rhythm, no footnotes or brackets); keep names per the glossary; keep dialogue punctuation natural for the target language (e.g. Italian «» or —, Portuguese —, and so on); never merge or split sentences; and when a sentence is untranslatable noise (e.g. a stray symbol), return it unchanged.
   - Output: `{ "items": [{"idx": number, "text": string}] }` with **every** input idx exactly once.
2. `schemas.ts`: a zod output schema that is strict-json_schema compatible (every property required, nullable not optional).
3. `align.ts`: `validateAlignment(input idx[], output)`, which detects missing, duplicate or extra idx entries and empty text. It returns `{ok, missing[], extra[], dupes[]}`. **Repair strategy**: re-request only the missing idx (one retry); if they are still missing, fall back to the source text for those sentences and flag `partial: true`.
4. `translate-chapter.ts`: `translateChapter({ sentences, sourceLang, targetLang, glossary, llm, chunker, onProgress, signal })`.
   - Uses `planLlmChunks` (~1,500 tokens of source per chunk) with *no overlap*, passing `previousContext` from the prior chunk.
   - Chunks run sequentially (continuity matters more than speed), with an optional `concurrency` param (default 1).
   - Returns `{ translations: Map<idx, string>, partialIdx: number[], usage }`.
   - The LLM transport is injected. Use the same transport type as analysis (`src/core/analysis/llm.ts`) or a shared one moved to `src/core/llm/transport.ts` if cleaner. If you move it, update the imports in analysis.
5. `glossary.ts`: `buildGlossary(memories: ChapterMemory[] up to the current chapter, entities)` merges glossary entries and entity canonical names into a deduplicated list capped to a token budget, preferring existing chosen translations so earlier chapters stay consistent.
6. `detect.ts`: `guessLanguage(text) → Lang|null`, a cheap script plus stopword heuristic (zh-Hans vs zh-Hant by a character set sample, ja via kana presence, ko via hangul, and the top Latin languages it, pt, es, fr, de and en via stopword hits). It is used to prefill the source language. Document its limits.
7. **Tests**:
   - prompt snapshot
   - alignment validation (all cases)
   - the repair path (first reply misses 2 ids, the repair supplies them)
   - fallback to source when the repair also fails
   - chunk continuity (`previousContext` from the prior chunk)
   - glossary merge and budget
   - language guess on the fixtures in `src/core/text/__fixtures__`
   - cancellation via `signal`

## Constraints
No new dependencies, and do not run `npm install`. Only touch `src/core/translate/**` (plus `src/core/llm/**` and the analysis import lines if you extract the shared transport). Do not commit.

## Acceptance
`npm run typecheck`, `npx eslint src/core --max-warnings 0` and `npm run test:core` pass (paste the tails). Include the system prompt in the report.
