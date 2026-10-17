# src/services

Adapters to the outside world: the OpenRouter client, the pipeline runtime and its adapters, the library's file store, the key store and the model cache.

**Layout**
- `openrouter/`: the only path to OpenRouter: client, chat, speech, PDF, model catalog, retries, errors (map: `openrouter/README.md`).
- `pipeline/`: the real pipeline: runtime, facade, core port adapters, hidden WebView, library files (map: `pipeline/README.md`).
- `extraction/index.ts`: re-exports the core page extraction for the app.
- `secrets.ts`: the user's OpenRouter key in the OS keystore (`getApiKey()`, `setApiKey()`, `clearApiKey()`).
- `storage.ts`: library folders (`covers/`, `sources/`, `audio/`, `previews/`) and their disk use.
- `catalog-cache.ts`: best-effort saved copy of the model catalog, for offline pickers.

**Entry points**
- `openrouter/client.ts`: `createOpenRouterClient()`.
- `pipeline/runtime.ts`: `createPipelineRuntime()`, the wiring that the app and the end-to-end test share.
- `secrets.ts`: `getApiKey()`, `setApiKey()`.
- `storage.ts`: `chapterSourcesDirectory()`, `writeBytes()`.

**Gotchas**
- Every LLM call goes through `openrouter/`, so cost and token accounting stay central.
- The key stays in the keystore. Nothing here logs, formats or returns it, except to its caller.
- Failures are `PipelineFailure` values. Redact the key before an error leaves the client.

**Tests**: `*.test.ts` beside each file. No test calls a paid API: the network is mocked with `__fixtures__/`. Run `npm test`.

**Import rules**

- May import from `src/core`, and from other `src/services` modules.
- All LLM calls go through `services/openrouter` so cost and token accounting stay centralized.
- Tests mock the network. Nothing here may call a paid API from a test.
