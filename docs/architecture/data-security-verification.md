# Architecture: Data model, security and verification

> Part of `docs/ARCHITECTURE.md` (system overview and sentence spine live there). ADRs in `docs/decisions/` win over this file.

## 7. Data model (SQLite via Drizzle)
`series`, `chapters`, `sentences` (+ FTS5 virtual table), `ambience_cues`, `chapter_memory`, `entities`, `entity_facts`, `audio_segments`, `jobs`, `usage_ledger`, `qa_messages`, `vocab`, `settings`. Large blobs (audio, raw HTML/PDF, covers) live on the filesystem with paths in the DB.

## 8. Security and privacy
- The API key lives only in the secure store. It is never logged, never exported, and redacted from error reports.
- Remote HTML is never executed in an app context. The WebView fallback is sandboxed, with no JS bridge beyond returning the extracted text.
- Content stays on the device. It is only sent to the models the user chose.

## 9. Verification without an Android SDK in CI
- Unit tests for all of `src/core` (Node).
- Component tests (jest-expo).
- A bundle check: `npx expo export --platform android` proves the JS bundle builds.
- Device builds go through EAS (needs the user's Expo account, so it is a gated action).
