# Architecture: Pipeline

> Part of `docs/ARCHITECTURE.md` (system overview and sentence spine live there). ADRs in `docs/decisions/` win over this file.

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

