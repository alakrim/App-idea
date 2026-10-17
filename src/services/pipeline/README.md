# src/services/pipeline

Purpose: the app's real pipeline. It wires the core runner and queue to the database, OpenRouter, library files and the hidden WebView.

**Layout**
- `index.ts`: `createLectioPipelineRuntime()`. `runtime.ts`: `createPipelineRuntime()`, the wiring with no React or Expo, shared with the end-to-end test.
- `facade.ts`: `createPipelineService()`, the `PipelineFacade` behind the UI. `progress.ts`: live chapter progress. `source-preview.ts`: local preview of a URL.
- `adapters/`: one per core port. `library-files.ts` and `expo-library-files.ts` handle files. `narration-id.ts` derives the profile id.
- `webview-*.ts(x)`: offscreen page render for extraction. `webview-host.tsx` is mounted by `features/pipeline/pipeline-lifecycle.tsx`.

**Entry points:** `index.ts` `createLectioPipelineRuntime()`; `runtime.ts` `createPipelineRuntime()`; `facade.ts` `createPipelineService()`.

**Gotchas:** PDFs use the free `cloudflare-ai` engine; `mistral-ocr` runs only after the user agrees to its cost. The queue is saved under the `pipelineQueue` settings key. A device voice cannot write files, so it cannot store a segment.

**Tests:** `*.test.ts` beside each file. `e2e.test.ts` runs the full wiring against a fake network (`__fixtures__/`). Run `npm test`.
