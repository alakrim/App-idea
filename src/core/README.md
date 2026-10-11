# src/core

Pure TypeScript domain logic: text, extraction, analysis, pipeline and memory.

**Import rules**

- Imports only from inside `src/core`. Never `react`, `react-native`, `expo*`, `@/` modules outside core, or relative paths that leave core.
- No I/O, timers or globals that need a runtime. Everything here must run in plain Node.
- Every module has unit tests beside it (`*.test.ts`). They run in the `core` Jest project.

**Planned subfolders**: `text/` (segmentation, normalization, chunking), `extract/` (HTML/PDF extraction and quality scoring), `analysis/` (ambience cue and memory schemas, prompts, validators), `pipeline/` (job graph, retry/resume, cost estimation), `memory/` (spoiler-safe retrieval and Q&A prompt assembly).
