# Design system: "Night Library"

Lectio is used at night, on commutes and with headphones. The feel is **a quiet private library lit by a reading lamp**: deep ink surfaces, warm amber light, literary serif type for the text itself and crisp sans for the UI. It should be premium and calm, never gamified or noisy.

## Principles
1. **Content is the hero.** Covers and text get the space. Chrome recedes.
2. **One accent.** Amber is reserved for the primary action and "now playing". Everything else is neutral.
3. **Motion explains.** Shared-element and spring transitions show where things came from. There are no decorative bounces.
4. **Every state is designed**: loading (skeleton shimmer), empty (illustration + one clear CTA), error (what happened and a retry), offline.

## Color tokens (dark is the default)
| Token | Dark | Light | Use |
|---|---|---|---|
| `bg` | `#0D0E12` | `#F7F4EE` | app background |
| `surface` | `#15171D` | `#FFFFFF` | cards, sheets |
| `surfaceRaised` | `#1D2028` | `#FBF8F2` | modals, player sheet |
| `border` | `#2A2E38` | `#E6E0D4` | hairlines (StyleSheet.hairlineWidth) |
| `text` | `#ECE8E1` | `#1A1814` | primary text |
| `textMuted` | `#9A968E` | `#6B655B` | secondary |
| `textFaint` | `#5E5B55` | `#A39C90` | tertiary, placeholders |
| `accent` | `#E8A84A` | `#B9761A` | primary action, playing state |
| `accentSoft` | `rgba(232,168,74,0.14)` | `rgba(185,118,26,0.10)` | highlight backgrounds (current sentence) |
| `onAccent` | `#1A1206` | `#FFFFFF` | text on accent |
| `success` | `#6BBF8A` | `#2F8A55` | |
| `warning` | `#E3B341` | `#9A6B00` | |
| `danger` | `#E5676B` | `#C0392B` | |
| `scrim` | `rgba(0,0,0,0.6)` | `rgba(0,0,0,0.35)` | |

Contrast: `text` and `textMuted` must meet WCAG AA on `bg` and `surface`. Verify this with a unit test that computes contrast ratios from the tokens.

## Typography
- **UI**: Inter (`@expo-google-fonts/inter`), weights 400/500/600/700.
- **Reading text**: Literata (`@expo-google-fonts/literata`), weights 400/500, plus italic. CJK falls back to the system font.
- Scale (size/line-height): `display 32/38 700`, `title 24/30 600`, `heading 18/24 600`, `body 16/24 400`, `bodyStrong 16/24 600`, `caption 13/18 500`, `micro 11/14 600 uppercase +0.6 tracking`, `reading 19/30 Literata` (user-adjustable 15–26).
- Respect the OS font scale up to 1.35×. Never truncate the primary title without `numberOfLines` plus an accessible full label.

## Spacing, radius, elevation
- Spacing scale (4pt base): `xxs 2, xs 4, sm 8, md 12, lg 16, xl 24, xxl 32, xxxl 48`. Screen gutter = `lg` (16).
- Radius: `sm 6, md 10, lg 16, xl 24, pill 999`. Covers use `md`. Sheets use `xl` top corners.
- Elevation: there are no Android material shadows on dark. Use a `surfaceRaised` color step plus a 1px top highlight `rgba(255,255,255,0.04)`.

## Motion
- Springs: `snappy {damping: 20, stiffness: 300}` for press feedback, and `gentle {damping: 18, stiffness: 160}` for sheets and layout.
- Durations: micro 120ms, standard 220ms, emphasized 360ms. Easing `Easing.bezier(0.2, 0, 0, 1)`.
- Press feedback: scale 0.97 plus a selection haptic on primary actions.
- Respect `useReducedMotion()`: swap springs for 0ms or fades.

## Core components (src/ui)
`Screen` (safe area + gutter + optional large title that collapses on scroll), `Text` (variant-driven), `Button` (primary/secondary/ghost/danger, sizes md/lg, loading state), `IconButton`, `Card`, `CoverImage` (expo-image, blurhash placeholder, generated gradient monogram when no cover), `TextField` (label, helper, error, secure toggle), `Sheet` (bottom sheet), `ListItem`, `Skeleton`, `EmptyState`, `ErrorState`, `ProgressRing`, `Badge`, `Toast`, `SegmentedControl`, `Slider`.

Icons: `lucide-react-native` at stroke width 1.75, sizes 20/24.

## Signature moments
- **Series cover → Series screen**: a shared-element-like expand, with the cover's dominant color tinting the header gradient (extract it with `expo-image` or a cheap average).
- **Mini player**: a persistent bar above the tab bar with the cover, title and a progress hairline in amber. Swiping it up opens the full player.
- **Full player**: a large cover over a blurred cover backdrop, a waveform-like scrubber, a synced text pane you can pull up, and an ambience indicator chip ("🌧 Rain · Tavern") with the live bed names.
- **Pipeline progress**: each chapter row shows a stage stepper (Extract → Clean → Analyze → Translate → Narrate) with a live ring. Tap it for details, cost so far and a retry button.
