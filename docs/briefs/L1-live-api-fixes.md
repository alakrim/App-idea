# Brief L1: Fixes from the live OpenRouter test (2026-10-11)

**Type**: implementation (bug fixes + small capabilities). Read `CLAUDE.md`, `docs/CONVENTIONS.md`, ADR-0003, ADR-0006, and the **"Live test findings"** section of `docs/STATE.md`.

The architect ran our real client and core engines against the live OpenRouter API (see the findings). All tests in this brief use **mocked** network calls. You do NOT have an API key, and you must not call any paid endpoint.

## Fixes
1. **PCM-only speech models (critical).** Live fact: `google/gemini-3.8-flash-lite-tts` (and every Gemini TTS) rejects `response_format: "mp3"` with HTTP 400 `Gemini TTS only supports response_format="pcm"`. With `pcm` it returns raw 16-bit little-endian mono, and the `content-type` header is `audio/pcm;rate=24000;channels=1`.
   - `src/core/narration/formats.ts` (new, pure): `speechFormatFor(modelId)` returns `'pcm'` for ids matching `/gemini.*tts/i` and `'mp3'` otherwise. Add `parsePcmContentType(ct) → {rate, channels}` (default 24000/1), `pcmToWav(bytes, {rate, channels}) → Uint8Array` (a 44-byte RIFF header), and `wavDurationMs(bytes)`.
   - `src/services/openrouter/speech.ts`: return the parsed content type unchanged. **Self-healing**: when a 400 body contains `only supports response_format="pcm"`, retry once with `pcm` and expose `formatUsed` in the result.
   - `src/services/pipeline/adapters/tts.ts`: request `speechFormatFor(model)`. Convert PCM to WAV, and return `mime: 'audio/wav'`. The narrate stage (`src/core/pipeline/stages/narrate.ts`) picks the file extension from the mime type and the duration from `wavDurationMs` for WAV (keeping `mp3DurationMs` for MP3).
   - Settings voice preview (`src/features/settings/use-voice-preview.ts`): same handling, so Gemini previews play.
   - Tests: header bytes, durations, the retry-with-pcm path, the narrate stage with a WAV-returning fake TTS, and a mixed-format chapter after a voice change.
2. **Error mapping.** A 400 caused by an unsupported parameter or format must map to a **non-retryable** error with a specific message ("This voice model can't produce that audio format."), never the generic retryable "Try again". Add a unit test using the exact live error body above.
3. **Speech rate by script (critical for CJK ambience).** Live fact: a 4-sentence Mandarin rain cue (~70 chars) was dropped as `too_short`, because duration assumed 15 chars/s.
   - Create `src/core/text/speech-rate.ts`: `estimateSpeechSeconds(text, lang?)`. Use characters per second by script, on the non-whitespace, non-punctuation count:
     - Latin/Cyrillic/Greek: ~14
     - Han (zh): ~4.5
     - Japanese (kana/kanji mix): ~7
     - Hangul: ~6.5
     - Thai: ~10
     - other: ~12
   - Document the sources/assumptions in a comment.
   - Use it in `src/core/analysis/validate-cues.ts` (minimum span), `src/core/llm/cost.ts` / the narration estimate in `src/core/pipeline/estimate.ts` (token-priced TTS seconds), and anywhere else `15 chars/s` appears (grep for it).
   - Tests:
     - the Mandarin rain cue from the live test survives
     - an English 3-sentence cue still respects the minimum
     - the cost estimate for a zh chapter on a token-priced model is about 3× a same-length en chapter
4. **Prompt caching.**
   - Add `cacheSystem?: boolean` to `chatRaw` (and the transport v2 request). It sets `cache_control: {type: 'ephemeral'}` on the system content block for providers that need explicit control (`anthropic/*`, `google/gemini*`, `qwen/*`). For others it is ignored (automatic caching).
   - The analysis and translation stages pass `cacheSystem: true`. Their static system prompts are large: the live analysis call used 4,677 prompt tokens, mostly the taxonomy.
   - Tests assert the request body shape per provider.
5. **Voice language metadata.**
   - `src/core/narration/voices.ts` (new, pure):
     - `voiceLanguage(modelId, voiceId) → Lang | 'multi' | null`, for the live voice-id conventions:
       - Microsoft MAI: `it-IT-Grant:MAI-Voice-2.1-Flash`, giving the locale prefix
       - Mistral Voxtral: `en_paul_neutral`, giving the language prefix
       - Kokoro: the first letter (`a`/`b` = en, `e` = es, `f` = fr, `h` = hi, `i` = it, `j` = ja, `p` = pt-BR, `z` = zh)
       - Gemini, ElevenLabs, OpenAI: `'multi'`
       - unknown: `null`
     - `voicesForLanguage(modelId, voices, lang)` returns the voices that can speak `lang`, multilingual voices included.
     - `defaultVoiceFor(modelId, voices, lang)` prefers the language's female-default Kokoro voices (`af_heart` if present, else the first `af_`, etc.), `Kore` for Gemini, and the first matching locale otherwise.
   - Tests with the real live voice lists below.
   - **Do not wire it into the settings UI.** Another worker is editing `src/features/settings/**` right now. The architect will brief the wiring.

## Live voice lists (from the live catalogue, for fixtures)
- MAI 2.1 Flash: `en-US-Ethan:MAI-Voice-2.1-Flash`, `it-IT-Grant:…`, `pt-BR-Caio:…`, `zh-CN-Bo:…`, `de-DE-Klaus:…`, `cs-CZ-Grant:…`. There is **no ja-JP**.
- Voxtral: locales `en`, `gb`, `fr` only (e.g. `en_paul_neutral`).
- Kokoro: includes `af_alloy`, `if_sara`, `pf_dora`, `zf_xiaobei`, `jf_alpha`.
- Gemini: `Zephyr, Puck, Charon, Kore, …` (30, multilingual). ElevenLabs v3: `george, sarah, adam, alice, bella, bill, …` (multilingual).

## Constraints
- Do not run `npm install`. Do not commit. No network calls.
- Concurrency: I2 is editing `src/features/{settings,vocab,ask,player,chapter}/**`, `app/**`, `src/core/analysis/ambience-taxonomy.ts`, `src/core/vocab/**` and `src/db/repos/{usage,vocab}-repo.ts`. The **only** settings file you may touch is `src/features/settings/use-voice-preview.ts` (item 1). If I2 has changed it, make a minimal edit and report it.

## Acceptance
`npm run verify` is green (paste the tail). The report gives, per fix, the test names, plus the measured narration cost-estimate change for the zh fixture.
