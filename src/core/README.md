# src/core

Pure TypeScript domain logic: text, extraction, analysis, pipeline, memory, playback and narration rules. It runs in plain Node, with no React, Expo or I/O.

**Layout**
- `domain/`: shared types and zod schemas (series, chapters, sentences, analysis, usage, ids). `domain/index.ts` re-exports them all.
- `text/`: sentence splitting, paragraphs, normalization, TTS and LLM chunking, timing (map: `text/README.md`).
- `extract/`: HTML and PDF text extraction, boilerplate removal, quality score, model block selection (map: `extract/README.md`).
- `pipeline/`: chapter runner, serial queue, stages, ports, cost estimate, input hashes (map: `pipeline/README.md`).
- `analysis/`: ambience cue and chapter memory schemas, prompts, validators, per-chapter map-reduce.
- `translate/`: chapter translation, sentence alignment check, glossary.
- `memory/`: prior-chapter context budget (`memory/codex.ts`), name matching (`memory/entities.ts`), spoiler-safe Q&A prompt (`memory/qa.ts`).
- `narration/`: narrator options, voice lists, audio formats (PCM is stored as WAV).
- `playback/`: timeline in media time, ambience bed plan, ducking, sleep timer, remote commands.
- `llm/`: JSON reply parsing, transport types, token cost math. `vocab/`: vocabulary explanation prompt.
- `defaults.ts`: default model ids. `settings.ts`: the model id schema.

**Entry points**
- `pipeline/runner.ts`: `runChapter()`, one chapter through its stages.
- `pipeline/ports.ts`: `PipelinePorts`, every I/O the core asks for.
- `analysis/map-reduce.ts`: `analyzeChapter()`.
- `text/build.ts`: `buildChapterText()`.
- `llm/json.ts`: `parseJsonReply()`, the first step for every model reply.

**Gotchas**
- Validate every model reply with zod. Schemas use `.nullable()` for absent values, never `.optional()` (ADR 0006).
- Sentence ranges (`TtsSegment`, `LlmChunk`) are inclusive at both ends.
- The model never rewrites text: extraction keeps only the block indices it picks.
- The runner never retries. The caller decides.

**Tests**: `*.test.ts` beside every module, in the `core` Jest project: `npm run test:core`. Fixtures live in `__fixtures__/`.

**Import rules**

- Imports only from inside `src/core`. Never `react`, `react-native`, `expo*`, `@/` modules outside core, or relative paths that leave core.
- No I/O, timers or globals that need a runtime. Everything here must run in plain Node.
- Every module has unit tests beside it (`*.test.ts`). They run in the `core` Jest project.
