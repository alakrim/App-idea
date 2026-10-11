# Brief I2: Integration, polish and in-app diagnostics

**Type**: implementation (cross-feature). Read `CLAUDE.md`, `docs/CONVENTIONS.md` (including the React Compiler rules), `docs/specs/design-system.md` and **all of the backlog and acceptance notes in `docs/STATE.md`** (sections for U1–U4, P1, P2, A1, B6, I1).

## Goal
Close the cross-feature seams and polish items, and add a **Diagnostics** screen so the first device test produces hard data.

## Scope
1. **Vocab from the player**: mount `VocabActionsProvider` in `app/_layout.tsx` above the player (under DB + OpenRouter). Make U3's player use U4's `src/features/vocab/vocab-actions.ts` hook (remove the no-op duplicate in `src/features/player/vocab-actions.ts` if it exists). The "Saved to Vocab" toast only appears after a real save.
2. **Deep link to a sentence**: `app/chapter/[chapterId].tsx` honours `?sentence=N`, scrolling to it and briefly highlighting it (`accentSoft`, fading out over 1.5 s; reduce-motion aware). The Vocab source taps already push it. Ask citation chips should push the cited sentence when known.
3. **Domain consistency**: add `reviewedAt`/`known` to the domain `VocabSchema`. Move the vocab explanation prompt + schema to `src/core/vocab/prompts.ts` (versioned) and keep a re-export where needed. Dedupe the language lists (U1 `src/features/settings/languages.ts` vs U2 `src/features/shared/languages.ts` → one in `src/features/shared/languages.ts`). Dedupe `src/features/shared/use-db-read.ts` vs the private `useLiveRead` in `src/db/hooks.ts` (export one).
4. **Ambience display names**: add `label` (English, Title Case, ≤ 18 chars) and `icon` (a lucide icon name) to each taxonomy entry in `src/core/analysis/ambience-taxonomy.ts`, and use them in the player chip, the ambience sheet and the chapter cue list. Test that every category has both.
5. **Polish list**:
   - Settings: drop the duplicate "Default" badge when the model equals "Recommended". Make the style field multi-line (3 lines). Onboarding step 2 gets a ScrollView with keyboard avoidance.
   - Vocab review: two equal-width buttons spanning the width, with the card vertically centred.
   - Ask: a "not revealed yet" answer has no citation chips.
   - `Card raised` in the light theme: use a hairline top border instead of the invisible white highlight.
   - Ambience settings "Play a sample": play `base_rain` through the real mixer for 8 s at the configured level (expose a minimal `previewBed(category, levelDb)` on the player controller), or keep it disabled with a reason if the controller can't support it cleanly.
   - `usageRepo`: add the stage dimension and move U1's feature-local query into it.
6. **Diagnostics screen** (`app/settings/diagnostics.tsx`, linked from About; hidden behind 7 taps on the version row, and always visible in `__DEV__`). It runs the probes and shows pass/fail with values, plus a **"Copy report"** button (expo-clipboard, JSON) for the user to paste back to us:
   - P1:
     - `Intl.Segmenter` exists, plus a sample sentence split (en, zh, ja)
     - `TextDecoder` with `gbk`, `big5`, `shift_jis` and `euc-kr` (decode a known byte sample each)
     - regex lookbehind and `\p{L}` support
   - P2: WebView host round trip on `https://example.com` (time + HTML length) and the bridge message size limit test (post 1 MB / 5 MB strings back).
   - Storage: expo-sqlite version (`select sqlite_version()`), FTS5 + trigram availability (create a temp virtual table), DB size, free space.
   - Audio (S1 subset): decode each base-pack bed and report duration and loop region; play voice-silence + one bed for 5 s and report ducking ramp timings from the mixer's scheduled times; report whether a lock-screen session is active.
   - Pipeline: the queue state and the last 10 job errors.
   - Env: app version, git sha (inject at build via `app.config.ts` `extra.gitSha` from `process.env.GIT_SHA ?? 'dev'`), RN/Expo versions, device model/OS (`Platform.constants`), Hermes on/off.
   - Each probe runs in isolation with a timeout. A crash in one never kills the screen.
7. **Tests**:
   - vocab from player (provider mounted)
   - sentence deep link
   - taxonomy labels/icons coverage
   - review layout snapshot-free assertions
   - Ask no-citation rule
   - each diagnostics probe with mocks (pass + fail + timeout)
   - report JSON shape
   - usageRepo stage totals

## Constraints
- Do not run `npm install`. Do not commit. Follow the React Compiler rules.
- A concurrent worker (B8) runs Android builds and may edit `app.config.ts` and `scripts/android/**` + `docs/BUILD-ANDROID.md`. Coordinate: your only `app.config.ts` change is `extra.gitSha`. Make it a minimal, isolated edit and report it.

## Acceptance
`npm run verify` is green (paste the tail). Web screenshots (fake-data harness as before; see the scratchpad harnesses from U2/U3) of the diagnostics screen (dark), vocab review (light) and the player chip with the new labels. Report each polish item as done or skipped with its reason.
