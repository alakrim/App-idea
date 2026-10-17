# Brief AM1: Ambience cues that are reliable and reproducible

**Type**: implementation (core analysis + pipeline adapters + diagnostics).

**Read first**: `CLAUDE.md`, `docs/CONVENTIONS.md`, **ADR-0005 and its amendments** (including the 2026-10-17 amendment at the end of the file), ADR-0006, `src/core/analysis/{prompts,limits,validate-cues,map-reduce,analysis-call,schemas,ambience-taxonomy}.ts`, `src/core/pipeline/stages/analyze.ts`, `src/core/llm/transport.ts`, `src/services/pipeline/adapters/{llm-port,chapter-store}.ts`, `src/services/openrouter/chat.ts`, `src/db/repos/cue-repo.ts` and `src/features/diagnostics/*`.

## Why
The user uploaded the same chapter twice. The first run got one ambience cue and the second got **none**. The architect's diagnosis:
1. **Non-deterministic sampling**: analysis calls send no `temperature`, so the provider default (often 1.0) applies, and cue picks vary from run to run.
2. **Over-strict gate**: the prompt only allows sounds the text "mentions". Combined with the confidence floor (0.55), min span (3 sentences, 12 s) and the density cap, borderline cues fall either side of the line at random.
3. **No reuse**: a re-upload is a new chapter id, so it pays for a fresh analysis and gets a fresh roll of the dice.
4. **No visibility**: `validateCues` returns the `dropped` reasons, but nothing stores or shows them.

## Scope
1. **Deterministic calls**:
   - `LlmTransport` requests gain optional `temperature` and `seed`. The llm-port forwards them to chat, which already supports `temperature`; add `seed` and check that the request body test covers it.
   - Analysis uses `temperature: 0` and a fixed `seed`. Translation is unchanged.
2. **Prompt v3, a setting-coverage policy** (bump `PROMPT_VERSION`; update the snapshot tests). The new rules:
   - Every scene with an identifiable **setting** (a place, weather, time of day, vehicle or crowd) should get the bed that fits that setting, even when no sound is named. A tavern scene gets `tavern_crowd`; a night forest walk gets `forest_night`; a ship gets `ship_deck`.
   - Mood categories (tension, horror, mystical, sci-fi drones) still need explicit textual evidence.
   - "Never cue music" stays. Silent scenes get no cue.
   - **Coverage goal**: when the chapter has identifiable settings, cues should cover roughly 40–80 % of the narration. Stick to the density cap from limits.
   - Keep the rules derived from `CUE_LIMITS`, so the prompt and validators cannot drift.
3. **Validator tuning** (an ADR-0005 amendment covers these numbers):
   - `confidenceFloor` goes to 0.45.
   - `maxPer1kWords` goes to 3.
   - Keep `minSentences` 3 and `minSeconds` 12.
   - Update the tests that pin the old values, and keep the mutation-style tests meaningful.
4. **Single-best-setting fallback**: if a chapter of at least 200 words ends with zero valid cues, run **one** cheap extra call. It returns at most one bed for the dominant setting of the whole chapter (or `null` when the chapter has no identifiable setting), with the same schema rules. It is validated with the same rules, and its span is the whole chapter (subject to the min span). Record its usage in the ledger like every call.
5. **Reuse for identical text**:
   - Cache the validated cues keyed by `stableHash(['cues', PROMPT_VERSION, model, sentences.map(s => s.text)])`.
   - Store it in a small new table (drizzle migration plus `bundled-migrations.ts`, with the journal test passing), or reuse an existing table if you can justify it.
   - On a re-upload with identical text and the same model and prompt version, cues are copied from the cache and no cue call is made. Memory still runs, because it depends on prior chapters. If the chunk structure makes it simpler, reuse the whole analysis response when the full analyze inputHash matches; justify the choice.
6. **Diagnostics**:
   - Persist a compact cue report per chapter: counts by drop reason, accepted count, coverage % and whether the fallback ran. Reason text from the model is never stored beyond the existing 80-char `reason`.
   - Show it in Diagnostics → a "Last analysis" card, and on the chapter screen's ambience list as one quiet line when there are no cues: "No ambience: no clear setting found".
7. **Tests**:
   - request body carries `temperature: 0` and `seed`
   - prompt v3 snapshot
   - validator thresholds
   - fallback runs only when zero cues and ≥ 200 words, and at most once
   - cache hit makes no cue call and yields identical cues
   - report persistence
   - Diagnostics card
   - an end-to-end analyze-stage test with a fake transport, proving that two runs over identical text give identical cues

## Constraints
- No real API calls, no new dependencies. **Do not edit `ambience-taxonomy.ts`** (brief SND1 owns the sounds; categories stay as they are). Don't touch `src/features/player/**`, `src/core/pipeline/queue.ts`, `src/core/pipeline/stages/{narrate,translate}.ts`, `modules/**`, `plugins/**`, `app.config.ts` or `assets/**`.
- You are in a git worktree. Before anything, run `ln -s /home/user/App-idea/node_modules node_modules` if `node_modules` is missing. **Commit** on your worktree branch when `npm run verify` is green, and report the branch and SHA.
- Update `docs/STATE.md` only by adding a short "AM1" line under "Work in flight".
