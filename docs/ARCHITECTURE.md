# Architecture (v1.0)

> Status: v1, research R1–R4 incorporated. Binding decisions are in ADRs 0001–0005 (`docs/decisions/`). Where this doc and an ADR disagree, the ADR wins. **[R#]** marks point to the evidence in `docs/research/`.

## 1. Shape of the system
- **Client-only, BYOK.** There is no backend. The phone calls OpenRouter directly with the user's key, which is kept in the OS keystore (`expo-secure-store`). This gives zero infra cost and privacy by default, and the user controls their spend.
- **Local-first.** All content, audio, analysis and memory live on the device (SQLite + files). Once a chapter is generated it plays offline.
- **Cross-platform.** One TypeScript codebase targets Android now and iOS next. **[R2]**

```
URL / PDF / Share-intent
        │
   ┌────▼─────┐   ┌─────────┐   ┌──────────┐   ┌────────────┐   ┌────────────┐   ┌───────┐
   │ Extract  │──►│ Clean   │──►│ Segment  │──►│ Analyze    │──►│ Translate? │──►│ Narrate│──► Player
   │ (local)  │   │(LLM only│   │(sentence │   │ 1 LLM call:│   │ (sentence- │   │ (TTS   │   (voice + ambience
   │          │   │ if poor)│   │  ids)    │   │ cues+memory│   │  aligned)  │   │ per seg)│    + synced text)
   └──────────┘   └─────────┘   └──────────┘   └────────────┘   └────────────┘   └───────┘
```

## 2. The sentence is the spine
After segmentation, every sentence gets a stable `(chapterId, sentenceIdx)`. **Everything anchors to it**:
- ambience cues (`startSentence..endSentence`)
- translation (sentence-id in → sentence-id out, so alignment survives translation and the bilingual view works)
- TTS segments (each covers a contiguous sentence range, with per-sentence offsets in ms)
- the playback position, karaoke highlight, bookmarks and vocab
- the spoiler cutoff for Q&A

## 3. Pipeline (resumable job graph)
Each chapter has a persisted job per stage: `pending → running → done | failed | skipped`. The graph resumes after an app kill. Every stage is idempotent and keyed by `(chapterId, stage, inputHash, promptVersion, model)`, so re-running is free when nothing changed.

| Stage | Where | Cost strategy |
|---|---|---|
| Extract | On device: fetch → charset decode → Readability-class extractor; WebView render as a fallback. PDF route: **[R3/R1]** | free |
| Clean | Quality score; if below threshold, an LLM receives *numbered paragraphs* and returns **only the indices to keep** | ≈ input tokens only, output tiny |
| Segment | `Intl.Segmenter` or a fallback; CJK-aware **[R3]** | free |
| Analyze | **One** structured call returning `{memory, cues}`; long chapters are map-reduced in chunks | cheap model, json_schema |
| Translate | Batches of sentence-id → text, carrying a series **glossary** (names/terms from memory) for consistency | user-chosen model |
| Narrate | Segments of about 1 paragraph (≤ ~600 chars); sentence offsets estimated by char weight | user-chosen voice model **[R1]** |

**Cost preview**: before running, estimate tokens × live model pricing from `GET /models` and show "≈ $0.06 for this chapter". There is a per-call usage ledger and a spend dashboard.

**Progressive playback**: playback can start as soon as the first narration segments are ready, while the rest keep generating.

## 4. Chapter memory and spoiler-safe Q&A
- The **memory card** per chapter is `{summary, keyEvents[], characters[{name, aliases, facts[]}], places[], items[], relationships[], openThreads[]}`. It has hard size caps so it stays compact (≈ 300–600 tokens).
- **Series codex**: entities are normalized across chapters (`entities`, `entity_facts(chapterIndex)`). Each fact is tagged with the chapter that revealed it.
- **Spoiler cutoff** = the user's furthest-listened position `(chapterIndex, sentenceIdx)`.
  - Earlier chapters: memory cards plus facts where `chapterIndex < cutoff.chapter`.
  - The current chapter: **never its memory card** (it contains the ending). Only FTS5 full-text hits on sentences `≤ cutoff.sentence`.
  - Future chapters: invisible.
- The Q&A prompt tells the model to answer **only** from the supplied notes, cite chapters, and say "not revealed yet" otherwise. This also blocks the model's own world knowledge of famous books, which would spoil.

## 5. Ambience
- There is a fixed taxonomy of categories **[R4]**. The LLM picks only from that enum, so it cannot invent sounds we don't have.
- A cue is `{category, startSentence, endSentence, intensity, fadeInMs, fadeOutMs, confidence}`. A validator enforces minimum length, a cap on cues per 1k words, no overlaps beyond 2 beds, and drops low-confidence cues.
- The mixer plays at most 2 beds, ducked under the voice (about −20 dB, tunable **[R4]**), with crossfades. Cues fire on sentence-boundary events from the player.
- Sound packs: a bundled base pack plus downloadable packs, with a license manifest per file **[R4]**.
- Users can toggle cues per chapter, and set ambience volume or turn ambience off globally.

## 6. Player and learning features
- Background playback, lock-screen and Bluetooth controls, cover art = series cover **[R2]**.
- Speed 0.5–2× with pitch preserved, a sleep timer (including "end of chapter") and auto-advance to the next chapter.
- Synced text view with the current sentence highlighted and auto-scroll. Tap a sentence to seek.
- **Learner mode**: a bilingual view (original under translation), repeat-sentence / A-B loop, and long-press a word or phrase to save it to **Vocab** with an in-context LLM explanation.

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
