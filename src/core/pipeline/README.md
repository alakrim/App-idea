# src/core/pipeline

Purpose: run one chapter through its stages, skip finished work and report progress. It does no I/O itself: every read and write goes through `ports.ts`.

**Layout**
- `runner.ts`: `runChapter()` runs the stages in order and skips jobs done with the same input hash (`hash.ts`).
- `queue.ts`: `createPipelineQueue()`, a serial, persisted chapter queue that resumes after a restart.
- `stages/`: `index.ts` lists the stages in order (`extract`, `segment`, `analyze`, `translate`, `narrate`), plus the `web-extract.ts` and `pdf-text.ts` helpers.
- `ports.ts` (every I/O interface), `context.ts` (stage and event types), `estimate.ts` (`estimateChapterCost()`), `meter.ts` (`CostMeter`), `errors.ts` (`StageFailure`, `isCancellation()`).

**Entry points:** `runner.ts` `runChapter()`; `queue.ts` `createPipelineQueue()`; `ports.ts` `PipelinePorts`.

**Gotchas:** the runner never retries; the caller decides. Narrate resumes at the first segment that is missing or was made from different input. Core never imports I/O: add a port instead.

**Tests:** `*.test.ts` beside each module and in `stages/`. `__fixtures__/fake-ports.ts` gives in-memory ports and `pages.ts` gives sample pages. Run `npm run test:core`.
