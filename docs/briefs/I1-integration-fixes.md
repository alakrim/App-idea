# Brief I1: Wave-2 integration fixes

**Type**: implementation, a set of small, precise fixes across core/services/db. Read `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/specs/domain.md` and the "Integration backlog" section of `docs/STATE.md`.

Another worker is concurrently editing `src/ui/**`, `app/**` and `src/__tests__/**`. **Do not touch those.**

## Fixes (each needs a test proving it)
1. **Q&A evidence across chapters**:
   - In `src/core/memory/qa.ts` `buildQaPrompt`, accept FTS hits from earlier chapters too: keep a hit iff `hit.chapterOrder < cutoff.chapterOrder || (hit.chapterOrder === cutoff.chapterOrder && hit.sentenceIdx <= cutoff.sentenceIdx)`. Memory cards stay strictly `< cutoff`.
   - Check that `src/db/repos/text-repo.ts` search applies exactly this predicate (it should already). Add a test in each layer.
   - Update the citation format if needed so hits from earlier chapters cite "(Ch. N)".
2. **keyEvents merge** (`src/core/analysis/merge-memory.ts`): when merging chunks, sample evenly across chunks to the cap (round-robin by chunk, chronological within the result) instead of keeping the first 10.
3. **Cue density** (`validate-cues.ts`): `cap = wordCount < 200 ? 0 : Math.max(1, Math.floor(2 * wordCount / 1000))`. CJK chapters have no spaces, so derive the "word count" for CJK as `cjkChars / 1.5` (document the heuristic) and use it consistently. Check how wordCount is computed today.
4. **Strict json_schema compatibility**:
   - Every zod schema that is sent to an LLM as an output schema (`src/core/analysis/schemas.ts`, `src/core/extract/select.ts`) must use `.nullable()` instead of `.optional()`, with every property required.
   - Add `stripNulls()` post-parse normalization so the domain types stay clean.
   - Update the prompt text that says "optional, leave them out" to "use null when you have nothing to say", then update the snapshots.
   - Add a unit test that walks `z.toJSONSchema(schema)` and asserts that every object has `required` equal to all of its keys and `additionalProperties: false`.
5. **Chunk planner**: replace the local planner in `src/core/analysis/map-reduce.ts` with `planLlmChunks` from `src/core/text/chunk.ts`, using an adapter if the shapes differ, and delete the duplicate.
6. **Shared error types**:
   - Move `ErrorCode` and `PipelineError` to `src/core/domain/pipeline.ts` (zod). If they already exist there, reconcile them with `src/services/openrouter/errors.ts` so there is a single source.
   - Services import from `@/core/domain`. Keep `PipelineFailure` (the Error subclass) in services.
   - Add a code `INPUT_TOO_LONG` (non-retryable) and use it for the speech length guard. Update `docs/specs/domain.md`'s ErrorCode list.
7. **402 in-flight budget**: in `src/services/openrouter/error-mapping.ts`, a 402 whose body indicates `openrouter_in_flight_budget` (see R1 §4) maps to `RATE_LIMITED`, retryable, honoring Retry-After.
8. **Position on chapter delete** (`src/db/repos/chapter-repo.ts` delete + `position-repo.ts`): before deleting a chapter, if it is the series' `current` or `furthest`, move that point to the last sentence of the nearest *previous* chapter (by order). If none exists, delete the position row. Do it in the same transaction.
9. **Migration bundle guard**: a Node test that reads `src/db/migrations/meta/_journal.json` and asserts that every entry's tag is present in `src/db/bundled-migrations.ts`.
10. **Extraction**:
    - (a) In `quality.ts`, compute the lexicon signal on the **pre-filter** blocks as an information signal with weight 0.05. Re-balance the other weights proportionally so the sum is 1. All fixture decisions must stay the same (update the score table in the test if the scores change).
    - (b) Add a post-filter rule for short pipe- or bullet-separated label lines with no terminal punctuation (e.g. "Weather | Live updates", "Home › News › World"), plus negatives.
11. **Metro bundling of the extract stack**:
    - Create `src/services/extraction/index.ts` that re-exports `extractArticle`/`extractFromHtml`, and import it (type-safe, unused-safe) from `src/services/index.ts` or a similar non-UI entry that `app/_layout.tsx` *already* imports. If none exists, create `src/bootstrap.ts`. **Do not edit `app/**`** and tell the architect which import line to add.
    - Run `npx expo export --platform android --output-dir /tmp/bundle-i1` with a temporary entry if needed to prove defuddle and linkedom bundle under Metro (Hermes bytecode). If resolution fails (`exports` map with only an `import` condition), fix it in `metro.config.js` (e.g. `resolver.unstable_conditionNames`, or `resolver.resolveRequest` mapping `defuddle/node` to its dist file). Report the bundle size delta.

## Constraints
- Do not run `npm install`. Do not commit. Do not edit `docs/STATE.md`.
- Keep each fix minimal and local.

## Acceptance
`npm run typecheck`, `npx eslint src/core src/services src/db --max-warnings 0` and `npx jest --selectProjects core node` pass. Paste the tails, and give a one-line summary per fix with its test name.
