# src/services/openrouter

Purpose: the only path to OpenRouter. Every call runs here, so cost, tokens, retries and errors are handled in one place.

**Layout**
- `client.ts`: `createOpenRouterClient()`, the client (`chatJson`, `chatText`, `chatRaw`, `synthesizeSpeech`, `parsePdf`, `validateKey`, `models`).
- `chat.ts`, `speech.ts`, `pdf.ts`: chat completions with JSON-schema output, `/audio/speech`, and the file parser. `transport.ts`: HTTP with timeout and body readers.
- `models.ts`: `createModelCatalog()`, live models and prices. `key.ts`: `validateKey()`. `cost.ts`: re-exports the core cost math.
- `retry.ts`, `rate-limit.ts`, `error-mapping.ts`, `errors.ts`: backoff, daily vs per-minute limits, HTTP status to `PipelineFailure`, secret redaction. `index.ts`: public exports.

**Entry points:** `client.ts` `createOpenRouterClient()`; `chat.ts` `chatJson()`, `chatRaw()`; `models.ts` `createModelCatalog()`; `errors.ts` `redactFailure()`.

**Gotchas:** always pass the PDF engine explicitly, because a missing one can bill OCR silently (`pdf.ts`). Redact the key from error text before it leaves here, and never log it. A daily free-model limit is not retried, since a short wait cannot clear it.

**Tests:** `*.test.ts` beside each file. The network is mocked with `__fixtures__/fake-fetch.ts`; no test calls OpenRouter. Run `npm test`.
