# Brief L1: Listening model (per-chapter resume, bookmarks, speed per series)

**Type**: implementation (DB migration + repos + player + series UI). **User-approved 2026-10-13** ("Bigger jump 4" from the QA audit). **Runs after N3 and F1 land**, because both touch the same areas and N3 adds a migration. Read `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/STATE.md`, `docs/qa/2026-10-13-QA-B-player-audio.md` (P2-15, J5), `docs/qa/2026-10-13-QA-A-pipeline-data.md` (position notes), then `src/db/{schema.ts,migrations/**,bundled-migrations.ts,repos/position-repo.ts}`, `src/core/playback/position-saver.ts`, `src/features/player/**`, `src/features/series/**`, `src/features/chapter/**`, `src/features/settings/**`, `src/features/ask/**` (it reads the spoiler cutoff).

## Problem
`listening_positions` holds **one row per series** (the current chapter and sentence). Listen to chapter 3 for an hour, open chapter 2 for a minute, then go back to chapter 3, and chapter 3 starts from the beginning. There are no bookmarks. Speed resets to 1× on every launch.

## Scope
1. **Per-chapter resume**
   - New migration (next number after N3's): `chapter_positions(chapter_id PK FK→chapters ON DELETE CASCADE, sentence_idx, position_ms, completed INTEGER, updated_at)`.
   - The series row keeps the **current chapter** pointer and the **furthest** point. The furthest point remains the spoiler cutoff for Ask and analysis, and it must keep moving forward only.
   - Backfill: each existing series row seeds one `chapter_positions` row for its current chapter.
   - `playChapter(id)` resumes that chapter's own saved point. A chapter marked `completed` (reached its end) starts from the beginning, and is marked unfinished again once played past 5 s.
   - The position saver writes per chapter, keeping the same coalescing and flush on pause, end and background.
   - **Continue** on the series screen and the library plays the series' current chapter at its own point.
2. **Chapter progress in the UI**
   - Each chapter row shows its state: a thin progress bar, "12 min left" (from the timeline duration and the saved position), or a "Finished" check. The current chapter gets a subtle "Now" marker.
   - Accessibility labels include this, e.g. "Chapter 3, 12 minutes left".
3. **Bookmarks**
   - Table `bookmarks(id, series_id FK, chapter_id FK, sentence_idx, position_ms, note TEXT NULL, created_at)`, with a cascade on chapter delete. The delete copy must mention bookmarks (QA-A P2-9 style).
   - Player: a Bookmark button in the transport row (filled when the current sentence is bookmarked; a toast "Bookmarked · Add note" opens a small note sheet). Add "Bookmark" to the sentence actions sheet too.
   - A **Bookmarks** list in the player's overflow and on the series screen. It is grouped by chapter, shows each bookmark's sentence snippet (first ~80 chars), note and timestamp, and taps jump there. It supports delete (swipe plus an accessibility action) and editing the note.
   - Empty state copy: "Bookmark a moment while you listen to come back to it here."
   - Bookmarks are spoiler-safe by nature (the user made them), but the list shows only chapters that exist.
4. **Speed per series**
   - Store the last-used speed on the series (a new nullable column, or a `series_settings` table). It applies when a chapter of that series loads.
   - Settings → Playback gets a **default speed** for new series (0.5–2.0, the same steps as the speed sheet).
   - The speed sheet says "Saved for this series".
5. **Ask/analysis cutoff**: confirm they still use the series' **furthest** point, not a chapter's own point. Add a test: listening to chapter 2 after having reached chapter 5 must not lower the cutoff.

## Tests (mutation-check the starred ones)
- ★ The resume scenario above: chapter 3 resumes after visiting chapter 2.
- ★ The furthest point never decreases.
- The migration backfill (run the bundled migration on a seeded DB with better-sqlite3; follow the `bundled-migrations.test.ts` pattern).
- Completed chapters restart from the beginning.
- Bookmark create, jump, note, delete, and cascade.
- Per-series speed applied on load; the default speed used for a new series.
- Row progress copy and accessibility labels.

## Constraints
No `npm install`, no commits. Use design tokens only (contrast per QA-C). Follow the React Compiler rules. If N4 or the data wave (F3) are running at the same time, coordinate on migration numbering: report it, never renumber an existing migration.

## Acceptance
`npm run verify` is green (paste the tail). The report includes screenshots or a description of the new UI states.
