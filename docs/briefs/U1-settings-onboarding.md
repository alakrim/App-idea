# Brief U1: Settings and onboarding (feature UI)

**Type**: implementation (feature UI). Read `CLAUDE.md`, `docs/CONVENTIONS.md`, **`docs/specs/design-system.md`**, the "UI review notes" section of `docs/STATE.md`, ADR-0003, and the existing `src/ui/**`, `src/app-shell/**`, `src/features/settings/settings-store.ts`, `src/core/settings.ts`, `src/core/defaults.ts`, `src/services/secrets.ts` and `src/services/openrouter/index.ts` (`validateKey`, `models.list`, `voicesFor`, `estimateSpeechCost`, `formatUsd`, `synthesizeSpeech`).

## Goal
A premium, fully working Settings area plus a first-run onboarding. This is where the user enters their OpenRouter key and picks models and voices with **live prices**.

## Scope
1. **Onboarding** (`app/onboarding/*`, shown when `!settings.onboardingDone`; redirect from the tab layout):
   - Three calm, illustrated steps:
     1. "Any page → an audiobook": a value proposition with a subtle Reanimated illustration built from tokens (no images needed: stacked page cards morph into a waveform).
     2. **Connect OpenRouter**: a key field with paste-from-clipboard, a link to `https://openrouter.ai/keys` (`expo-web-browser` is not installed, so use `Linking.openURL`), live validation via `validateKey()` showing the key label/usage/limit, and clear error copy for AUTH, NETWORK and so on.
     3. **Privacy and content notice**: the text you import is sent to the models you choose using your key; import only content you have the right to read. Sets `contentNoticeAccepted`.
   - Skippable except the notice. Skipping the key is allowed: the app works for browsing, and features that need it show a "Connect OpenRouter" prompt.
2. **Settings home** (`app/(tabs)/settings.tsx`): grouped list sections with **chevrons and current-value subtitles** (fix from the UI review):
   - Account: API key (status: Connected · label / Not set)
   - Narration (model · voice)
   - Translation (model · default target language or "Off")
   - Analysis & cleanup models
   - Ambience (On · −22 dB)
   - Reading (text size)
   - Appearance (System/Dark/Light)
   - Usage & costs
   - Storage (MB used)
   - About (version, licenses incl. `assets/ambience/LICENSES.json` + fonts OFL)
3. **API key screen** (`app/settings/api-key.tsx`): masked current key (last 4 only), validate, replace, remove (with confirm), and key info from `/key` (usage, limit remaining, free tier). Never render the full key after saving.
4. **Model picker** (reusable `src/features/settings/model-picker.tsx`):
   - Searchable list from the live catalog filtered by modality and capability (structured output for analysis/cleanup).
   - Each row shows provider, name, context and **price per 1M in/out**.
   - A "Recommended" section on top from `src/core/defaults.ts`.
   - Handles offline (cached catalog) and the model-disappeared case: the saved model is not in the catalog → a warning row with a "Choose another" action.
5. **Voice picker** (`app/settings/narration.tsx`):
   - Tiers (Budget / Recommended / Premium), computed from live pricing and shown as **≈ $/hour of narration** (54k chars/h).
   - Voices for the selected model (`voicesFor`), plus **Preview**: synthesize a fixed ~15-word sample in the user's target or UI language via `synthesizeSpeech`, cache it on disk under `previews/` keyed by model+voice+lang+style, and play it with `expo-audio` (a simple `useAudioPlayer` is fine here).
   - Before the *first* paid preview, show a one-time confirmation ("Previews use your OpenRouter credits, ≈ $0.0005 each").
   - A style instruction field (shown only if the model supports `instructions`; assume Gemini TTS does per R1) and a speed slider (0.8–1.2).
   - A "Device voice (free, offline)" option using `expo-speech` voices.
6. **Translation screen**: default target language (a searchable language list with native names, e.g. "Italiano"), plus "Off". Translation model picker.
7. **Ambience screen**: on/off, a level slider (−30…−14 dB, labelled "Subtle ↔ Present"), ducking amount, and a "Play a sample" button (a placeholder that is disabled with "Available with the player" if `src/audio` isn't ready; check whether `src/features/player/player-store.ts` exposes something usable, otherwise disable).
8. **Usage & costs** (`app/settings/usage.tsx`): totals today / 7 days / 30 days from `usageRepo`, broken down by stage and model, with a simple bar list (no chart library). Use the `dataviz` guidance if you need colors; keep it to tokens.
9. **Appearance + Reading**: a theme segmented control with live switching, and a reading text-size preview in Literata.
10. **Slider primitive**: add `src/ui/slider.tsx` (gesture-handler + Reanimated, accessible with `accessibilityRole="adjustable"` and increment/decrement actions, haptic ticks) since the design spec lists it.
11. Fix the UI-review items that are in your area: large-title top spacing (in `src/ui/screen.tsx`) and the light accent contrast (darken the light `accent` in tokens until the contrast test asserts ≥ 4.5 on `bg`; update the tokens test).
12. **Tests**:
    - onboarding flow (key validation states mocked)
    - API key masking (the full key never appears in the rendered output)
    - model picker filtering/search/missing-model state
    - voice-tier price math
    - preview cache key
    - usage aggregation display
    - the slider's accessibility actions

## Constraints
- Do not run `npm install`. Do not commit.
- Concurrency: another worker (U2) owns `app/(tabs)/index.tsx`, `app/series/**`, `app/chapter/**` and `src/features/{library,series,chapter}/**`. A2 owns `src/audio/**` and `src/features/player/**`. P1 owns `src/core/{pipeline,llm,analysis,translate}`. You own `app/onboarding/**`, `app/settings/**`, `app/(tabs)/settings.tsx`, `src/features/settings/**`, `src/ui/slider.tsx`, `src/ui/screen.tsx` and `src/ui/tokens.ts` (accent only + test). If you must touch `app/(tabs)/_layout.tsx` for the onboarding redirect, keep the change minimal and report it.
- No paid API calls in tests. Mock the OpenRouter client.

## Acceptance
`npm run typecheck`, `npm run lint` and `npm test` pass for your files, and `npm run bundle:check` passes (paste the tails). Then do a **visual check**: `npx expo export --platform web --output-dir /tmp/web-u1` and screenshot onboarding steps 1–3, settings home, the narration screen and the usage screen in dark + light at 390×844 with Playwright (script and installed playwright in `/tmp/claude-0/-home-user-App-idea/afe9cb94-dd9c-5941-9d44-dde24bca9e56/scratchpad/shot.mjs`, which takes an output dir. Copy and adapt the route list). The web build has no SQLite. If the DB provider fails on web, add a minimal web-only in-memory fallback **only if it takes under ~30 lines**; otherwise render the screens in the dev gallery with fake data for screenshots. Save the screenshots under `.../scratchpad/u1-shots/` and list them in the report.
