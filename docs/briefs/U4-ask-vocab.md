# Brief U4: Ask (spoiler-safe Q&A) and Vocab

**Type**: implementation (feature UI + data). Read `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/specs/design-system.md`, **`docs/ARCHITECTURE.md` §4**, `docs/specs/domain.md` (Spoiler cutoff, QaMessage, Vocab), ADR-0006, and the existing `src/core/memory/{qa,codex,entities}.ts`, `src/db/repos/{text,position}-repo.ts`, `src/db/schema.ts`, `src/services/openrouter/index.ts` (`chatText`, `chatJson`), `src/app-shell/openrouter-provider.tsx` and `src/features/settings/settings-store.ts`.

## Goal
1. **Ask**: the user picks a series and asks anything ("Who is Lin Mo's master again?"). The answer is grounded only in what they've already heard, with chapter citations, and **never spoils**.
2. **Vocab**: save words or phrases while listening, with an in-context explanation for learners, then review them.

## Scope
1. **Repos** (+ tests):
   - `src/db/repos/memory-repo.ts`: `saveMemory(chapterId, memory, model, promptVersion)`, `listMemoriesBefore(seriesId, cutoffOrder) → ChapterMemoryRecord[]`, `saveEntityResolution(...)`, `listEntities(seriesId)`, `listFactsBefore(seriesId, cutoffOrder)`. The pipeline (P2) will use the write functions, so make them transactional.
   - `src/db/repos/qa-repo.ts`: append/list messages per series.
   - `src/db/repos/vocab-repo.ts`: add, list (by series, by lang, search), delete, and `setReviewed`. Add a `reviewedAt` column only if it is needed; if you change the schema, generate a migration with `npm run db:generate` and update `bundled-migrations.ts`, since the I1 guard test enforces it.
2. **Ask service** (`src/features/ask/ask-service.ts`):
   - Cutoff = `positionRepo` furthest for the series. With no position row, answer "Start listening to this series first, and I'll answer from what you've heard."
   - Gather: the codex (`buildPriorContext`), memories before the cutoff, and FTS hits from `textRepo.search(seriesId, query terms, cutoff)` (extract 2–5 keywords from the question locally: names via the entity list plus non-stopwords; no LLM call for this).
   - Build with `buildQaPrompt`, call `chatText` with the analysis model from settings, and record usage in the ledger (`usageRepo`, stage `'qa'`).
   - Stream-like UX: show a typing state, then reveal.
   - Parse citations "(Ch. N)" into tappable chips that open the chapter reading view at that chapter.
3. **Ask screen** (`app/(tabs)/ask.tsx` + `src/features/ask/*`):
   - A series selector (a chip row of series with any analyzed chapter).
   - The chat thread (user bubbles right, answer cards left with Literata text and citation chips).
   - Suggested questions when the thread is empty (generated locally from the codex: "Who is {top character}?", "What happened in chapter {n−1}?", "Where is {top place}?").
   - The input with send. Errors (no key, offline, credits) show inline with actions.
   - A **spoiler shield** badge in the header: "Up to Ch. 7 · 42%". Tapping it explains the cutoff.
   - The empty state (no series) remains as designed.
4. **Vocab**:
   - Implement `VocabActionsContext` (U3 consumes it from `src/features/player/`; if it doesn't exist yet, define it in `src/features/vocab/vocab-actions.ts` and tell the architect to reconcile).
   - `saveToVocab({seriesId, chapterId, sentenceIdx, text, selection?})` stores the item immediately (optimistic), then asynchronously fetches an explanation via `chatJson` with schema `{ term, lemma, partOfSpeech|null, translation, explanation /* ≤ 40 words, in the UI language */, example|null }`, using the sentence as context and the target language as the "studied" language. Record usage.
   - The **Vocab tab** (`app/(tabs)/vocab.tsx` + `src/features/vocab/*`): grouped by language then series. Cards show term, translation and explanation, with the source sentence (tap to jump to it in the chapter view). Search. Swipe to delete. A "Review" mode with flashcards (front: term in context, back: translation + explanation; mark Known/Again stored on the item).
5. **Tests**:
   - the cutoff gathering (spoiler tests at the service level: a fact from the chapter after the cutoff never reaches the prompt; the current chapter's memory card never reaches the prompt)
   - keyword extraction
   - citation parsing
   - no-position behaviour
   - optimistic vocab save, then explanation fill, plus failure keeping the item with a retry
   - the review mode state machine
   - the screens' render states

## Constraints
- Do not run `npm install`. Do not commit. No paid calls in tests.
- Ownership: you own `app/(tabs)/{ask,vocab}.tsx`, `src/features/{ask,vocab}/**` and `src/db/repos/{memory,qa,vocab}-repo.ts` (+ schema/migration only if strictly needed). Others: U1 (settings), U2 (library/series/chapter), U3 (player, playback-repo, audio-segment-repo), P1 (core pipeline/llm/analysis/translate).

## Acceptance
`npm run typecheck`, `npm run lint`, `npm test` and `npm run bundle:check` pass for your files (paste the tails). Visual check: web export plus Playwright screenshots (dev gallery with fake data if needed) of Ask with a thread and citations, Ask suggestions, Vocab list and Vocab review, in dark + light, saved to `.../scratchpad/u4-shots/`.
