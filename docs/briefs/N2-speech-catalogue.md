# Brief N2: Show every OpenRouter speech model, newest first (Fish Audio Drama 3 and others)

**Type**: implementation (services + settings UI).

**Read first**: `CLAUDE.md`, `docs/CONVENTIONS.md`, ADR-0003 and its amendments, `src/services/openrouter/{models,speech,client}.ts`, `src/services/pipeline/adapters/{catalog,tts}.ts`, `src/features/settings/{narration-choices,model-kinds,model-picker,model-row,model-search,model-catalog,narration-settings,narrator-copy}.ts(x)`, `src/core/narration/{options,voices,formats}.ts` and `src/core/text/chunk.ts`.

## Why (root cause, verified live by the architect on 2026-10-17)
The user can't find the newest voice models in Settings → Narration → "All speech models" (they asked for Fish Audio's new Drama model). The live catalogue (`GET /api/v1/models?output_modalities=speech`) has 35 models, and the app **does** fetch them. But `narratableModels()` in `narration-choices.ts` keeps only models with `supported_voices.length > 0`, or one of the three curated narrators. These models list **no preset voices**, so they are hidden:

| id | created | price (per char, prompt) | notes |
|---|---|---|---|
| `fish-audio/drama-3` | 2026-10-13 | 0.000002 (≈ $0.11/h) | directed performances; supports `instructions`; voice cloning |
| `fish-audio/s2.1-pro` | | 0.000015 | |
| `fish-audio/s2-pro`, `fish-audio/s1` | | 0.000015 | |
| `bytedance-seed/seed-audio-1-0` | | completion 0.0025 | treats `input` as a prompt; rejects `voice` together with references |

OpenRouter docs (fetched 2026-10-17): when `voice` is omitted, it routes only to providers whose adapter has a default voice. `instructions` is supported by OpenAI gpt-4o-mini-tts, **Gemini TTS and Fish Audio models**. `response_format` is `mp3` or `pcm`.

## Scope
1. **Catalogue**:
   - Parse `created` (unix seconds, nullish) into `OpenRouterModel.createdAt: number | null` (wire schema, stored snapshot schema with a default, and the cache schema in `model-catalog.ts`). Keep old snapshots readable.
   - Drop the in-memory catalogue TTL for **speech** to 10 minutes. Opening the picker always does a live fetch, with the snapshot as fallback (verify the current behaviour, and add pull-to-refresh to the picker list).
2. **Narratable models** = every model whose output modalities include `speech`, except an explicit, documented deny-list of models that cannot read a text verbatim. Seed Audio treats `input` as a prompt, so exclude it for narration, with a comment. A model with no voices narrates with its default voice (the voice is omitted, as the Fish free narrator already does).
3. **Sort and badges** in the speech picker:
   - The three curated narrators come first, as today. Then the rest, **newest first** by `createdAt`, with name as the tie-break.
   - A **"New"** badge for models created in the last 30 days (injectable clock).
   - The row's subtitle says "Default voice" instead of "Own voice" when there are no voices.
   - Search still works.
4. **Style support**:
   - `supportsStyle` (catalog adapter) and `supportsStyleInstructions` (narration-choices) must agree, from one shared pure helper in `src/core/narration/`: Gemini TTS, `gpt-4o-mini-tts`, any `fish-audio/*` model, or `supported_parameters` including `instructions`.
   - Tests for each.
5. **Per-model segment size** for non-curated models: Fish models 1,800 chars, others 600 (as now). Keep it in one place in `src/core/narration/options.ts` (e.g. `segmentMaxCharsFor`).
6. **Language guard**: unknown models have no language list, so never block them; the guard stays for curated narrators only.
7. **Tests**: catalogue parsing with `created` present, absent and null; old snapshot compatibility; narratable filter (Drama 3 included, Seed excluded, voice-less included); sort order; New badge boundary; style helper; segment size; the picker renders Drama 3 with "New" and "Default voice". Use a fixture copied from the live catalogue: `docs/research/fixtures/openrouter-speech-2026-10-17.json` (the architect saved it; move it under a `__fixtures__` folder if tests need it there).

## Constraints
- No real API calls, no new dependencies. Don't touch `src/core/pipeline/**`, `src/features/player/**`, `src/features/pipeline/**`, `app.config.ts`, `modules/**`, `plugins/**` or `assets/**`.
- You are in a git worktree. Before anything, run `ln -s /home/user/App-idea/node_modules node_modules` if `node_modules` is missing. **Commit** on your worktree branch when `npm run verify` is green, and report the branch and SHA.
- Update `docs/STATE.md` only by adding a short "N2" line under "Work in flight".
