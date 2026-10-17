# src/features/settings

Purpose: the settings home and its pages: API key, models, narration, ambience, reading, appearance, usage and onboarding.

**Layout**
- Key: `key-form.tsx`, `use-key-connection.ts`, `use-saved-key.ts`, `key-check.ts` (checks an unsaved key), `key-format.ts` (masking).
- Models and narration: `model-*.ts(x)`, `narration-*.ts(x)`, `narrator-*.ts(x)`, `use-voice-preview.ts`, `preview-cache.ts`, `device-voice*`.
- Pages: `ambience-settings.tsx`, `reading-settings.tsx`, `appearance-settings.tsx`, `usage-view.tsx`, `onboarding/`.
- Shell and data: `settings-page.tsx`, `settings-section.tsx`, `setting-controls.tsx`, `settings-store.ts`, `summaries.ts`, `usage*.ts`.

**Entry points:** `settings-store.ts` `useSettings()`; `model-catalog.ts` `useModelCatalog()`; `narration-choices.ts` `narrationForOption()`.

**Gotchas:** the key never enters the settings store; it lives in the OS keystore (`services/secrets.ts`). The unsaved-key check does not store it. Paid voice previews need recorded consent (`preview-cache.ts`).

**Tests:** `*.test.ts(x)` beside each file. Screen tests live in `src/__tests__/settings/`. Run `npm test -- src/features/settings`.
