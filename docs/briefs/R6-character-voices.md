# Brief R6: Character voices and expressive delivery, feasibility study

**Type**: research (web + public catalogue checks + code reading). Output: `docs/research/R6-character-voices.md`. Read `CLAUDE.md`, ADR-0003 (with amendment), ADR-0006, `docs/research/R1-openrouter.md`, `src/core/narration/{options,voices,formats}.ts`, `src/core/pipeline/stages/narrate.ts`, `src/core/text/{chunk,timing}.ts`, `src/core/analysis/*` (prompt, schemas, entities/codex) and `src/core/memory/*`.

## The user's ask
"A significant step would be different voices for characters (is that feasible and realistic?) and intonation independent of the chosen TTS model."

## Questions to answer
1. **Who is speaking.** How reliably can an LLM attribute each sentence or quote to the narrator or a named character, across languages? Cover:
   - Chinese web novels (「」 and “” quotes)
   - Japanese
   - European languages with em-dash dialogue (Italian, Spanish, Portuguese)
   - English

   Summarise published results on quote attribution (e.g. PDNC, the work on LLM quote attribution) and propose how to do it inside our **existing analysis call**: extra schema fields, prompt-token cost, and chunk boundaries. Reuse the series **entity codex** so a character keeps the same id across chapters.
2. **Voice casting.**
   - A per-series cast: character → voice, chosen from gender, age and personality in the codex, then user-overridable.
   - Constraints: voices available **per language and per model**. Kokoro voices are language-prefixed. Gemini has 30 multilingual voices. Fish free has no voice choice.
   - How many distinct voices each of our three narrator options can really offer per language.
3. **What the models can do today.** Check the public OpenRouter catalogue (`https://openrouter.ai/api/v1/models`, no key needed) for every speech model, and the vendors' docs. For each model:
   - multi-speaker in one request? (Gemini TTS supports up to 2 speakers: confirm the limits and whether OpenRouter's `/audio/speech` exposes it)
   - natural-language steering (`instructions`)
   - inline tags (e.g. ElevenLabs v3 `[whispers]`, if on OpenRouter)
   - SSML
   - speed, pitch and emotion parameters
   - price
3b. **"Intonation independent of the TTS model."** Design a model-agnostic **delivery layer**:
   - the LLM annotates each line with emotion, intensity, pace, emphasis words and pause before/after (one small schema)
   - per-model adapters render it:
     - Gemini or gpt-4o-mini-tts: an instructions text
     - tag-capable models: inline tags
     - Kokoro and others: speed parameter, punctuation and pause shaping, segment-level speed
     - optional client-side DSP (gentle tempo/pitch per line, silence insertion)

   Be honest about what each model can and cannot express. Rate the expected quality gain per model 1–5 with reasons.
4. **Cost, latency and engineering impact.**
   - Dialogue lines are short, so request counts grow. Estimate requests and $ per hour for a dialogue-heavy chapter on each narrator option (single voice vs cast vs cast + delivery).
   - Effects on segment planning, sentence timing (`sentenceOffsetsMs`), caching (hashes), resume, and the player (more, shorter files; gapless joins).
   - Option: merge a narrator line and a character line into one Gemini 2-speaker request to keep request counts down.
5. **Risks**: wrong attribution (and how the user fixes it: a "reassign speaker" action), voice drift across segments, voices unavailable in a language, cost surprises, spoilers in cast lists.
6. **Recommendation**: a phased plan, each phase with scope, cost impact and the evidence we need from a live test:
   - **P1**: delivery directions only, single voice
   - **P2**: narrator + 2–4 cast voices
   - **P3**: full cast + user casting UI

   Include what a **one-chapter live A/B listening test** should contain (the user approves any paid calls separately).

## Rules
No paid API calls, no key needed (the public model list is fine). Cite sources with URLs. Do not commit. Do not edit code.

## Acceptance
The report answers 1–6 with:
- a capability table per speech model
- the delivery-layer schema (TypeScript-ish type)
- the per-model adapter table
- a cost table
- the phased plan
