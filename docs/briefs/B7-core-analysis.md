# Brief B7: Analysis engine (ambience cues, chapter memory, spoiler-safe Q&A assembly)

**Type**: implementation, pure TypeScript in `src/core/analysis/` and `src/core/memory/`. Read `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/specs/domain.md` (Analysis + Spoiler cutoff), `docs/ARCHITECTURE.md` §4–5, **`docs/decisions/0005-ambience.md`** and **`docs/research/R4-ambience.md`** (the taxonomy table and cue prompt draft).

## Goal
The prompt builders, schemas, validators and merge logic for the single **analysis call** that returns `{memory, cues}` for a chapter, plus the spoiler-safe context assembly for Q&A. The LLM transport is injected (a function type). Do not import the OpenRouter client.

## Scope
1. `analysis/ambience-taxonomy.ts`: all 59 categories from R4 as a typed `const` array `{ id, family, kind: 'bed'|'oneshot', description, fallback?: id }`, the `AmbienceCategoryId` union type and a zod enum. For v1, `ENABLED_KINDS = ['bed']`. Every bed must have a `fallback` chain ending in a procedural base-pack id (`rain_light`/`wind`/`ocean`/`crowd_murmur`/`space_hum`/`fire_crackle`, or whatever R4's procedural ids are), or `null` for "skip if unavailable". Test that the chains have no cycles and terminate.
2. `analysis/schemas.ts`: zod for the LLM output. `memory` matches `ChapterMemory` in the spec, with the size caps enforced by **truncation** (not rejection) in a normalizer. `cues` contains `{category, startSentence, endSentence, intensity, confidence, reason}`; fade times are not asked from the LLM and come from defaults.
3. `analysis/prompts.ts`: `PROMPT_VERSION`, plus `buildAnalysisPrompt({ sentences: {idx, text}[], seriesTitle, chapterTitle, priorContext: string /* compact series codex so far */, lang })`.
   - Sentences are presented as `[idx] text` lines.
   - The system prompt contains the full enabled taxonomy (`id: description`), the cue rules from ADR-0005 and the memory rules: facts only from this chapter, no speculation, names exactly as written, glossary for invented terms/names with a suggested translation if the source is not in the target language.
   - Write it as a **cacheable prefix**: the static system part comes first and is identical across chapters, so provider prompt caching hits.
4. `analysis/validate-cues.ts`: `validateCues(rawCues, { sentenceCount, wordCount, sentences })`. Apply ADR-0005: clamp ranges, drop confidence < 0.55, require a minimum span (≥ 3 sentences and ≥ ~20 s estimated at 15 chars/s), cap at 2 per 1k words keeping the highest confidence, allow at most 2 overlapping beds, merge adjacent same-category cues, map oneshot categories out in v1, and attach default fades by intensity. Return `{ cues, dropped: {cue, reason}[] }` for debugging.
5. `analysis/map-reduce.ts`: for chapters bigger than one LLM chunk (use the `planLlmChunks` *signature* from `src/core/text/chunk.ts`; if that file is not there yet, define a local interface and a TODO-free adapter), run the analysis per chunk, then **merge**:
   - cues: concatenate and re-validate
   - memory: union characters/places/items by normalized name with deduped facts, concatenate keyEvents in order then cap, take the last chunk's openThreads, and make one optional **reduce call** to rewrite the summary from the chunk summaries (injected LLM function)
6. `memory/entities.ts`: `normalizeName` (NFKC, casefold, strip diacritics, collapse width/space; CJK untouched beyond NFKC), and `resolveEntities(existing: Entity[], memory: ChapterMemory, chapterOrder) → { upserts, newFacts }`, matching on canonical name or alias with merged aliases.
7. `memory/codex.ts`: `buildPriorContext(entities, facts, memories, cutoffOrder, budgetTokens)`, a compact text codex of everything known **strictly before** `cutoffOrder`, prioritized by recency and mention frequency and truncated to budget. It is used both as the analysis `priorContext` and for Q&A.
8. `memory/qa.ts`: `buildQaPrompt({ question, cutoff: {chapterOrder, sentenceIdx}, codex, memories /* only order < cutoff */, ftsHits /* only ≤ cutoff, already filtered by the DB */, lang })`.
   - **Defense in depth**: re-filter inputs by cutoff inside this function too, and assert in tests.
   - The system prompt includes: answer only from the notes; cite chapters as "(Ch. N)"; if the answer is not in the notes, say it hasn't been revealed yet; never use outside knowledge of the work even if it is famous; answer in the user's UI language.
9. Tests:
   - taxonomy integrity
   - schema truncation
   - every cue validation rule
   - the merge logic
   - entity resolution (aliases, CJK names, diacritics)
   - the codex budget and cutoff
   - **spoiler tests**: content from `order ≥ cutoff`, or the current chapter's memory card, never reaches the Q&A prompt
   - prompt snapshot tests (stable prefix)

## Constraints
No new dependencies, and do not run `npm install`. Only touch `src/core/analysis/**` and `src/core/memory/**`. If you need domain types before `src/core/domain` exists, import them from `@/core/domain`. Another worker is creating that module concurrently; if it is not there when you finish, define minimal local types in `src/core/analysis/types.ts` and report it so the architect can reconcile.

## Acceptance
`npm run typecheck`, `npm run lint` and `npm run test:core` pass (paste the tails). Include the final analysis system prompt text in your report.
