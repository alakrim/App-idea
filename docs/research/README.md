# Research reports: index

**Do not read these by default.** They are about 19k words in total, and every decision they led to is already in the ADRs and `docs/architecture/`. Open one only when the user or a brief names it, and then jump to the section you need (use grep on `^## `).

| Report | Question it answered | Where the outcome lives |
|---|---|---|
| `R1-openrouter.md` | What OpenRouter offers: TTS (`/audio/speech`), PDF input, models API, key validation, structured output, prompt caching, cheap models, rate limits | ADR-0003, ADR-0006, `src/core/defaults.ts`, `src/core/llm/cost.ts` |
| `R2-mobile-stack.md` | Framework, audio engine, storage, inputs, background work, UI kit, testing, builds | ADR-0002 |
| `R3-content-extraction.md` | HTML to main content, quality scoring, LLM index-selection cleanup, CJK/encoding, PDF text, segmentation, web-novel quirks | ADR-0004, `src/core/extract`, `src/core/text` |
| `R4-ambience.md` | Redistributable sound sources, taxonomy, layering, formats, seamless loops, procedural fallback, cue schema | ADR-0005, `assets/ambience/README.md` |
