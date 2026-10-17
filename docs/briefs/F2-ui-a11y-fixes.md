# Brief F2: UI, copy and accessibility fixes from the AAA audit

**Type**: implementation (UI layer only). Read `CLAUDE.md`, `docs/CONVENTIONS.md` (React Compiler and Worklets rules), `docs/STATE.md` (F1, N3, N4, L1 sections), and **`docs/qa/2026-10-13-QA-C-ux-a11y.md`**, the source of every item below, with file:line. Also read the QA-D items cited here.

## Scope
1. **Tokens and contrast** (QA-C P1-9, P1-10, P2-1):
   - `textFaint`: dark `#8E8980`, light `#6F695F`. Add `decorativeFaint` with the old values for the grabber, chevrons and ticks.
   - A new **`boundary`** token (light `#8F877A`, dark `#6B7182`) for control outlines: TextField, secondary Button, the segmented track and the Switch track off.
   - Light `success` `#2A7A4B`, `warning` `#8A6500`, and accent text on accentSoft `#875010`. Add an `accentOnSoft` token if needed.
   - Extend `src/ui/contrast.ts` tests to assert ≥ 4.5 for every text token on bg and surfaceRaised, and ≥ 3 for boundary.
2. **Sheets** (P1-8, P1-11, P2-4, P2-8):
   - Android back closes an open sheet (`BackHandler` in `Sheet`).
   - Sheet lists use `BottomSheetFlatList`/`BottomSheetScrollView` (the language picker, and check the others).
   - The sentence sheet scrolls.
   - `accessibilityViewIsModal`, and focus moves to the sheet title on open.
3. **Stop a running chapter** (P1-3): add a **Stop** action in the chapter view's Processing section and in the chapter menu, calling `pipeline.cancel(id)`. The confirm copy says what is kept: "Stop preparing this chapter? Finished audio is kept, and you can continue later."
4. **Paid actions need a price** (P1-2): Re-generate audio shows a ConfirmSheet with the narration estimate ("Re-generate audio? About $x. The current audio is replaced.").
5. **One retry policy** (P1-4): every failed chapter shows **Try again** in both the row and the chapter view. The copy follows the error: for non-retryable errors, say what to change ("Choose another narrator in Settings, then try again.").
6. **Long-press alternatives** (P1-5):
   - A visible ⋯ (48 dp) on chapter rows and library series cards.
   - `accessibilityActions` mirroring every long-press action: move, re-generate, stop, delete.
   - The player parts are done (F1); skip those.
7. **Copy fixes**:
   - The Vocab empty state reads "Press and hold a sentence while you listen, then choose Save to Vocab." (P1-7).
   - "Already in Vocab" on duplicates (P3-6).
   - "Chapter ready: «title»" (P3-18).
   - Plain words instead of "OCR" and sentence numbers: "Read scanned pages (≈ $x)"; cue ranges as timestamps when a timeline exists, otherwise "Near the start/middle/end" (P3-3).
   - The disabled Create button says why (P2-15).
   - The draft chapter gets a "Prepare this chapter" action (P2-14).
   - Action toasts stay until dismissed, or at least 8 s (P2-13).
8. **Estimate unknown** (P1-1, UI part): when the estimate is `unknown` (F3 adds the type; until then, treat `usd === 0` with the basis "pricing unavailable" as unknown), show "Can't price this right now" with Retry. Create needs an explicit "Create anyway" confirm. Add a `.catch` on the estimate promise.
9. **Touch targets 48** (P2-2): `minTouchTarget = 48`. Replace the hard-coded 44s. Check the layouts don't break (the tests and the web screens).
10. **Onboarding** (P2-11, P2-12): honour reduce motion; add a Back button; move the legal notice before the key step; let the user skip the whole flow.
11. **Small ones**:
    - `Card` passes `accessibilityLabel` and `accessible` (P2-5).
    - The ambience cue row label (P2-6).
    - The text-pane "Open text" labels (P2-7).
    - Count labels ("3 series", P3-1).
    - Label-in-name (P3-2).
    - The key screen uses ConfirmSheet, not Alert (P3-10).
    - Chip `selected` → value (P3-11).
    - Font caps through the token (P3-12).
    - Literals → tokens (P3-13).
    - `pickPdf` catch (P3-17).
    - The disabled Play reason is shown visibly (P3-19).
    - Pressable `Card` requires a label at type level (P3-20).
    - `router.back` guard (P3-7).
    - The copy toast awaits the write (P3-5).
12. **Lists and settings performance in the UI** (QA-D P2-7, P2-8):
    - The series chapter list becomes a `FlatList`.
    - Vocab becomes a `SectionList`.
    - Settings storage size is computed asynchronously in an effect, with a skeleton, and refreshed on focus.
13. **Notifications in Settings** (N4 open item): Settings → Notifications row explains "Lectio shows progress while it prepares chapters in the background", with the state (on/off) and a button that opens the system settings (`Linking.openSettings()`).

## Out of scope
- 200 % font scaling (P2-3: a separate programme).
- The Android keyboard on edge-to-edge (P2-10: needs a device; note it).
- Core/services/db changes, except reading existing APIs. **F4 is editing `src/services/**`, `src/core/extract/**` and `src/db/repos/**` at the same time; don't touch them.** If a fix needs a service change, describe it in the report.
- A4 paths: `scripts/sounds/**`, `assets/**`, `src/core/analysis/**`, `src/core/playback/resolve-bed.ts`, `src/audio/ambience-pack.ts`.

## Tests
- Contrast assertions.
- Sheet back handling.
- Stop with confirm.
- Re-generate confirm.
- The retry policy matrix.
- The accessibility actions on rows and cards.
- The estimate-unknown state.
- The onboarding Back and skip.
- The notifications row.

Mutation-check: contrast, the back handler, Stop.

## Acceptance
`npm run verify` is green (paste the tail). If it fails only in A4 or F4 areas, show that yours pass with targeted runs plus typecheck and lint. Describe the visual changes. If you can, run a web export of `app/dev/screens` in a scratch copy and take screenshots in both themes, as QA-C did.
