# Architecture: Chapter memory and spoiler-safe Q&A

> Part of `docs/ARCHITECTURE.md` (system overview and sentence spine live there). ADRs in `docs/decisions/` win over this file.

## 4. Chapter memory and spoiler-safe Q&A
- The **memory card** per chapter is `{summary, keyEvents[], characters[{name, aliases, facts[]}], places[], items[], relationships[], openThreads[]}`. It has hard size caps so it stays compact (≈ 300–600 tokens).
- **Series codex**: entities are normalized across chapters (`entities`, `entity_facts(chapterIndex)`). Each fact is tagged with the chapter that revealed it.
- **Spoiler cutoff** = the user's furthest-listened position `(chapterIndex, sentenceIdx)`.
  - Earlier chapters: memory cards plus facts where `chapterIndex < cutoff.chapter`.
  - The current chapter: **never its memory card** (it contains the ending). Only FTS5 full-text hits on sentences `≤ cutoff.sentence`.
  - Future chapters: invisible.
- The Q&A prompt tells the model to answer **only** from the supplied notes, cite chapters, and say "not revealed yet" otherwise. This also blocks the model's own world knowledge of famous books, which would spoil.

