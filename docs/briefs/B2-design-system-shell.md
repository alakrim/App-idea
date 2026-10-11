# Brief B2: Design system and navigation shell

**Type**: implementation. Read `CLAUDE.md`, `docs/CONVENTIONS.md` and **`docs/specs/design-system.md`** (authoritative) first.

## Goal
Build `src/ui` (tokens, theme, primitives) and the app's navigation shell so it already looks like a premium product with no real data.

## Scope
1. `src/ui/tokens.ts`: colors (dark + light), spacing, radius, typography, motion, exactly as in the spec. `src/ui/theme.tsx`: `ThemeProvider` + `useTheme()`, following the system scheme with a user override (`'system'|'dark'|'light'`, persisted later; for now just in context).
2. Fonts: Inter + Literata via `@expo-google-fonts/*` loaded in `app/_layout.tsx`, with the splash held until they load (`expo-splash-screen`).
3. Primitives (each in its own file, with typed props, an `accessibilityLabel` or role, and theme-aware): `Screen`, `Text`, `Button`, `IconButton`, `Card`, `CoverImage` (expo-image; when `uri` is null, render a deterministic gradient + monogram from the title via `expo-linear-gradient`), `TextField`, `ListItem`, `Skeleton` (Reanimated shimmer, reduce-motion aware), `EmptyState`, `ErrorState`, `Badge`, `ProgressRing` (react-native-svg), `SegmentedControl`, `Toast` (simple context-driven), `Sheet` (use `@gorhom/bottom-sheet` if it supports Reanimated 4 / SDK 57, otherwise a Reanimated-based minimal sheet). Haptics via `expo-haptics` on primary presses. Icons: `lucide-react-native`.
4. Navigation (expo-router, typed routes):
   - Tabs: **Library** (`app/(tabs)/index.tsx`), **Ask** (`ask.tsx`), **Vocab** (`vocab.tsx`), **Settings** (`settings.tsx`). Use a custom tab bar matching the design (blurred `surfaceRaised`, amber active icon, haptic on change).
   - Stack routes (placeholders with proper headers): `series/[seriesId].tsx`, `series/new.tsx` (modal presentation), `chapter/new.tsx` (modal, takes the `seriesId` param), `chapter/[chapterId].tsx`, `player.tsx` (full-screen modal).
   - A `MiniPlayer` placeholder component docked above the tab bar (hidden when nothing is loaded; a prop/flag to show a demo state).
5. Each tab screen shows its designed **empty state**:
   - Library: "Your shelf is empty", plus a CTA "New series".
   - Ask: "Ask about anything you've already heard", with an explanation of spoiler-safety.
   - Vocab: "Save words while you listen".
   - Settings: section list skeleton with *API key*, *Narration*, *Translation*, *Ambience*, *Appearance* and *Usage & costs*. Rows only; the real settings are another brief.
6. `app/dev/gallery.tsx` (only reachable in `__DEV__`): renders every primitive in every state for visual QA.
7. Tests:
   - Unit test computing WCAG contrast of `text`/`textMuted` on `bg`/`surface` (both themes, AA ≥ 4.5 for text, ≥ 3.0 for textMuted at large sizes if it fails 4.5; report the actual numbers).
   - Render tests for Button (loading/disabled), EmptyState and the Library tab empty state.

## Constraints
- **All dependencies are already installed.** Do not run `npm install`. If something essential is missing, stop and report.
- Use tokens only, with no literal colors or spacings outside `tokens.ts`.
- Do not touch `src/core`, `src/db`, `src/services` or `src/audio`. Other workers own them right now.

## Acceptance
`npm run typecheck`, `npm run lint`, `npm test` and `npm run bundle:check` all pass (paste the tails). List every primitive with its props in your report.
