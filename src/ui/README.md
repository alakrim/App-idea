# src/ui

Design system: tokens, theme, primitives, motion, haptics and icons. Dark-first, with a light theme.

**Layout**
- `tokens.ts`: every colour, spacing, radius, type size and motion value. `theme.tsx`: `ThemeProvider` and `useTheme()`.
- `text.tsx`, `screen.tsx`, `card.tsx`, `list-item.tsx`, `badge.tsx`: text and surfaces.
- `button.tsx`, `icon-button.tsx`, `segmented-control.tsx`, `slider.tsx`, `text-field.tsx`: controls.
- `sheet.tsx`, `toast.tsx`, `tab-bar.tsx`: overlays and tab chrome.
- `empty-state.tsx`, `error-state.tsx`, `skeleton.tsx`, `progress-ring.tsx`: async states and progress.
- `cover-image.tsx`, `cover-gradient.ts`: series covers, with a stable gradient per title.
- `icons.ts`: the icon set. The only module that imports `lucide-react-native`.
- `motion.ts`, `use-press-scale.ts`, `haptics.ts`, `fonts.ts`, `contrast.ts`: motion, press feedback, haptics, fonts, WCAG contrast.

**Entry points**
- `tokens.ts`: the tokens to use for any colour, space, radius or type size.
- `text.tsx`: `Text`, with its tones and variants.
- `sheet.tsx`: `Sheet`.
- `theme.tsx`: `useTheme()`.
- `motion.ts`: reduce-motion-aware helpers.

**Gotchas**
- No magic numbers for colour, spacing or radius. Use `tokens.ts`.
- `Text` renders nothing when its font size is 0 or less, because Android's text layout throws on it.
- Every interactive primitive takes an `accessibilityLabel` and a 44pt minimum touch target.
- Haptics are best-effort: a failed buzz never breaks a tap.

**Tests**: `src/__tests__/ui/` (buttons, empty state, slider, text font size, tokens), with `src/__tests__/helpers/render-themed.tsx`. Run `npm test`.

**Import rules**

- Only imports from React, React Native and Expo packages, plus `src/core` for shared types. No feature or service imports.
- Use design tokens only. No magic numbers for colour, spacing or radius.
- Every interactive primitive has an `accessibilityLabel` and a 44pt minimum touch target.
