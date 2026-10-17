# src/features/chapter

Purpose: one chapter's screen (source, processing status, reading view with sentence focus, ambience cues) and the add-chapter form.

**Layout**
- Screen: `chapter-screen.tsx` (route data), `chapter-view.tsx` (layout), `chapter-data.ts` (`readChapterScreen()`), `reading-text.tsx`, `ambience-list.tsx`.
- Progress: `stage-steps.ts` (the five steps), `stage-stepper.tsx`, `chapter-status.ts` (row state), `estimate-card.tsx`.
- Sentence focus: `sentence-focus.ts` (`parseSentenceParam()`), `use-sentence-focus.ts`, `use-sentence-scroll.ts`.
- Add chapter: `add-chapter-screen.tsx`, `source-state.ts` (URL and PDF checks), `source-preview-card.tsx`.

**Entry points:** `chapter-screen.tsx` `ChapterScreen`; `add-chapter-screen.tsx` `AddChapterScreen`; `stage-steps.ts` `stepStates()`; `chapter-data.ts` `readChapterScreen()`.

**Gotchas:** deep links take a 0-based `sentence` route param, and anything else is ignored. The highlight fades linearly, and under reduce motion it holds full strength before it drops. `segment` is internal and counts toward the Clean step.

**Tests:** `*.test.ts(x)` beside each file. Run `npm test -- src/features/chapter`.
