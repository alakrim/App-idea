# Brief N1: Three narrator options from the start (cheaper alternatives to Gemini)

**Type**: implementation (core + services + settings UI + onboarding). Read `CLAUDE.md`, `docs/CONVENTIONS.md` (including the **React Compiler** and **Worklets** rules), ADR-0003 and its amendment, `src/core/defaults.ts`, `src/core/settings.ts`, `src/core/narration/{formats,voices}.ts`, `src/services/openrouter/speech.ts`, `src/services/pipeline/adapters/tts.ts`, `src/core/pipeline/stages/narrate.ts`, `src/core/text/chunk.ts`, `src/features/settings/{narration-settings,voice-tiers,voice-tier-card,use-voice-preview}.ts(x)` and `src/features/settings/onboarding/*`.

## Why
The user finds Gemini Flash Lite TTS (~$0.55 per hour of narration) a bit expensive. They want **three narrator choices offered from the start**: Gemini plus two cheaper options. The architect chose the two from the live OpenRouter catalogue (2026-10-11), excluding English-only models because this is a language-learning app:

| Option | Model id | Price | Facts |
|---|---|---|---|
| **Best quality** (current default) | `google/gemini-3.8-flash-lite-tts` | ~$0.55/h | PCM-only (stored as WAV), 30 multilingual voices, honours the `instructions` style |
| **Budget** | `hexgrad/kokoro-82m` | ~$0.03/h | MP3, 54 voices whose **first letter is the language**: a/b=English, e=Spanish, f=French, h=Hindi, i=Italian, j=Japanese, p=Portuguese (BR), z=Chinese. No other languages. |
| **Free** | `fish-audio/s2.1-pro-free:free` | $0 | Multilingual, but the catalogue lists **no voices** (the model uses its default voice). OpenRouter **rate-limits free models** per minute and per day, and the daily cap is lower for accounts with little purchased credit. Its output formats are not documented. |

## Scope
1. **Curated narrator options** (`src/core/narration/options.ts`, pure):
   - Export `NARRATOR_OPTIONS`, three entries `{ id: 'best'|'budget'|'free', modelId, label, tagline, supportsStyle, languages: Lang[] | 'multi', defaultVoice(lang), segmentMaxChars, notes }`.
   - Gemini: 600 chars. Kokoro: 600. **Fish free: 1,800** (fewer requests means fewer rate-limit hits; stay under the 4,000-char speech guard).
   - `optionFor(modelId)`.
   - `isLanguageSupported(option, lang)`, where Kokoro's support is derived from the voice-letter mapping and `voicesForLanguage` in `voices.ts`.
2. **Per-model segment size**: `planTtsSegments` in the narrate stage uses the option's `segmentMaxChars` (default 600). Changing narrator still regenerates only narration (existing behaviour).
3. **Voices**:
   - Gemini defaults to `Kore`.
   - Kokoro defaults by target language (e.g. `if_sara` for Italian, `pf_dora` for pt-BR, `zf_xiaobei` for zh, `jf_alpha` for ja, `af_heart` for English if present else the first `af_*`), and its voice list in Settings shows only voices matching the language.
   - Fish free has no voice: **omit the `voice` field** from the speech request when a model has no voices. Check that `synthesizeSpeech` and the TTS adapter allow that, and adjust the types.
4. **Robust audio format for Fish (undocumented)**:
   - Request `mp3` first.
   - If the 400 says only certain formats are supported, self-heal: the existing PCM retry already covers "only supports response_format=pcm". Generalise it to parse the supported format from the error text when possible, e.g. `wav` or `pcm`.
   - Use the response `content-type` to decide the container (mp3 → `.mp3` with the mp3 duration parser; pcm → wrap as WAV; wav → store as is and read its duration from the header).
   - Unit-test each path with mocked responses.
5. **Free-tier limits, handled like a premium app**:
   - 429 → retry with backoff, as today.
   - If the response or error says the **daily** free limit is reached (OpenRouter free-model limit messages mention "free-models-per-day", "per day" or `X-RateLimit-*` headers; handle both), map it to `RATE_LIMITED` with a specific user message: "The free narrator's daily limit is used up. Narration will continue tomorrow, or switch to the Budget narrator (about $0.03 per hour) in Settings."
   - Keep the chapter resumable: segments already done stay done.
6. **Settings → Narration**: replace the tier cards with **three option cards**. Each shows:
   - its label and tagline
   - a **live price per hour** from the catalogue ("Free" for $0)
   - a language-support line ("All languages", or "8 languages: English, Spanish, …")
   - a "Not available for <target language>" state when unsupported, with the card disabled
   - the notes (free limits)
   - a **Preview** button that uses the existing preview path and cache

   Keep "All speech models" (advanced picker) and "Device voice" below. Selecting a card sets `narration.model`, the default voice for the series or app target language, and the style only for Gemini.
7. **Onboarding "at the start"**: add a step **"Choose your narrator"** after "Connect OpenRouter".
   - It shows the same three cards (shared component), Best quality preselected, with Preview available once a key is connected (otherwise "Connect OpenRouter to hear a sample").
   - The choice is saved to settings and can be changed later in Settings.
8. **Defaults**: keep Gemini as the default (`src/core/defaults.ts`), matching the user's earlier pick.
9. **Tests**:
   - option catalogue integrity
   - Kokoro language support and default voices
   - voice omitted for Fish
   - per-model segment size
   - format self-heal paths (mp3, pcm, wav)
   - daily-limit mapping and message
   - settings cards (price, unsupported-language disabled, select)
   - the onboarding step (renders, saves the choice)

## Constraints
- No real API calls: there is no key here, so mock the network. Do not run `npm install`. Do not commit.
- Follow the React Compiler and Worklets rules. `npm run verify` now includes `worklet:check`.
- Don't touch `src/features/player/**`, `src/ui/text.tsx`, `src/ui/cover-image.tsx`, `index.js` or `plugins/**`.

## Acceptance
`npm run verify` is green (paste the tail). The report lists the three options as implemented, the exact speech request bodies sent for each (from the tests), and anything about Fish that remains unverified without a live call.
