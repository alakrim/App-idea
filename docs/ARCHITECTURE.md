# Architecture (v1.0)

> Status: v1, research R1–R4 incorporated. Binding decisions are in ADRs 0001–0006 (`docs/decisions/`). Where this doc and an ADR disagree, the ADR wins. **[R#]** marks point to the evidence in `docs/research/` (do not open unless asked).

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

## 3. Detail by area (open only the one you need)
| Area | File | Covers |
|---|---|---|
| Pipeline | `docs/architecture/pipeline.md` | job graph, stages, cost preview, progressive playback |
| Memory and Q&A | `docs/architecture/memory-qa.md` | memory card, series codex, spoiler cutoff |
| Ambience | `docs/architecture/ambience.md` | taxonomy, cue validation, mixer, sound packs |
| Player | `docs/architecture/player.md` | background playback, speed, sync view, learner mode |
| Data, security, verification | `docs/architecture/data-security-verification.md` | SQLite tables, key handling, test and build checks |
