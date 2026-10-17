# Brief F4: Performance and size fixes from the AAA audit

**Type**: implementation (services, core/extract, db repos, boot). Read `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/STATE.md`, **`docs/qa/2026-10-13-QA-D-performance-health.md`** (the source of every item, with file:line and the desktop benchmarks; its scripts are under `/tmp/claude-0/-home-user-App-idea/005bdf22-f3a2-59c7-918d-ae1c7220d1ea/scratchpad/qa-d/`) and the QA-A items cited.

## Scope
1. **The catalogue snapshot is written only after a real network fetch** (QA-D P1-1). Add an `onFetched` hook in `createModelCatalog`, used by `openrouter-provider.tsx`.
   - In-flight de-duplication per modality (P2-1).
   - Hydrate the snapshot lazily on first model use, not on the first render (P3-4).
   - Tests: no write on a cache hit; 3 concurrent `list` calls make 1 request.
2. **Debounce the estimate (300 ms)** on the add-chapter screen, keep the last estimate visible while it recomputes, and memoise the character count (P1-1).
   - This touches `src/features/chapter/add-chapter-screen.tsx` and `source-state.ts`. F2 is editing UI at the same time: **only change the estimate effect and the count; leave all copy and layout to F2.**
3. **Parse each page once** (P1-2): one linkedom parse per page, link density computed once, the parsed Document passed to both extractors, and blocks built from nodes.
   - Before merging: prove output parity on every fixture in `src/core/extract/__fixtures__` (byte-identical extraction results), and report a before/after timing with QA-D's `parse-cost.cjs` method.
4. **Use Defuddle's browser build** (P2-6): import `defuddle` (browser, `new Defuddle(doc, { url }).parse()`) instead of `defuddle/node`, and update the Jest mapping. Prove parity on all fixtures. Report the bundle-size delta (sourcemap attribution, like QA-D).
5. **Load the extraction stack lazily** (P2-5): remove the eager `export * from '@/services/extraction'` in `bootstrap.ts`, and require it inside the extract port on first use. `npm run bundle:check` and `boot:check` must stay green. Report the boot-time module count and size before and after.
6. **DB:**
   - The ledger total uses `WHERE chapter_id = ?`, and the segment count uses `COUNT(*)` (P2-2).
   - `setTranslations` becomes a chunked multi-row upsert (P2-4).
   - **The FTS change (P2-3) is not in scope.** It needs a migration and a search-quality check; note a proposal in the report.
7. **Dead code** (QA-D P3-1, QA-A P3-10): remove the listed dead exports, and fix the two unused test bindings (P3-2).
8. **CI** (P2-11): `.github/workflows/verify.yml`:
   - on pull_request and on push to the branch
   - Node 22 (add `.nvmrc` if missing)
   - `npm ci`, then `npm run verify`
   - cache npm and the Jest cache
   - **skip `sounds:verify` in CI** if it needs the audio files and ffmpeg. Check whether ffmpeg is on the ubuntu runner; if so, keep it.
   - Note in the report that it can't be run here.

## Out of scope
- R8 and on-demand packs (user decisions).
- The Expo upgrade.
- zod.
- UI layout and copy (F2).
- `src/core/pipeline/**` behaviour changes (F3 comes next).
- A4 paths: `scripts/sounds/**`, `assets/**`, `src/core/analysis/**`, `src/core/playback/resolve-bed.ts`, `src/audio/ambience-pack.ts`.

## Tests
Every change has a test. Mutation-check:
- the snapshot write
- in-flight de-duplication
- extraction parity: one test runs all fixtures through the old and new paths

## Acceptance
`npm run verify` is green (paste the tail). If it fails only in A4 or F2 areas, show that yours pass with targeted runs, typecheck and lint. Report the before/after numbers for the bundle and the parsing.
