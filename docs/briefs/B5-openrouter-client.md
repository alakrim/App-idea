# Brief B5: OpenRouter client, cost estimation and LLM utilities

**Type**: implementation, pure TypeScript (no React/Expo imports) so it runs in Node tests. Read `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/specs/domain.md` (Pipeline errors, Usage), `docs/decisions/0003-narration-via-openrouter.md` and **`docs/research/R1-openrouter.md`** (request/response shapes).

## Location
`src/services/openrouter/`. It must not import from `react`, `react-native` or `expo*`; the only dependencies are `zod` and `fetch`. Add a Node Jest project for `src/services/openrouter/**/*.test.ts` in `jest.config.js` (you may edit only that part of the file).

## Scope
1. `client.ts`: `createOpenRouterClient({ getApiKey: () => Promise<string|null>, fetchImpl?, baseUrl?, appUrl, appTitle, timeoutMs? })`.
   - Every request sends `Authorization: Bearer`, `HTTP-Referer` and `X-Title` (plus `X-OpenRouter-Title`) and uses an `AbortController` timeout. It honors an external `AbortSignal`.
   - **Error mapping** to `PipelineError` codes: 401 → `AUTH`, 402 → `INSUFFICIENT_CREDITS`, 429 → `RATE_LIMITED` (parse `retry-after`), 404/400 "model not found"/"no endpoints" → `MODEL_UNAVAILABLE`, network/abort → `NETWORK`/`CANCELLED`, 5xx → retryable `UNKNOWN`. Messages are user-facing, short and human (e.g. "Your OpenRouter key was rejected. Check it in Settings."). **Never include the key in any error or log.**
   - Retry with exponential backoff and jitter for retryable errors (max 3), injectable sleep for tests.
2. `models.ts`: `listModels({ outputModality?: 'text'|'speech'|'embeddings' })` validated with zod (keep only the fields we use: id, name, context_length, pricing, architecture.input_modalities/output_modalities, supported_parameters, supported_voices). An in-memory cache with a TTL plus a `serialize()`/`hydrate()` pair so the app can persist it. Helpers: `supportsStructuredOutput(model)` and `voicesFor(model)`.
3. `key.ts`: `validateKey()` → `{ valid: true, label, usage, limit, limitRemaining, isFreeTier } | { valid: false, error }` using `GET /api/v1/key`.
4. `chat.ts`: `chatJson<T>({ model, system, user, schema: ZodType<T>, jsonSchemaName, temperature?, maxTokens?, signal?, cacheControl? })`
   - Sends `response_format: {type:'json_schema', json_schema:{name, strict:true, schema}}` when the model supports structured outputs (convert zod to JSON Schema with `zod-to-json-schema`, or zod v4's built-in `z.toJSONSchema` if the installed zod is v4; check which). Otherwise it sends a JSON-only instruction.
   - It parses tolerant JSON (strips ``` fences and leading prose), then validates with zod. **On failure it makes exactly one repair call** sending the validation errors back, then throws `LLM_INVALID_OUTPUT`.
   - Returns `{ data, usage: {promptTokens, completionTokens, costUsd|null}, generationId, model }`. Ask OpenRouter for usage accounting (`usage: {include: true}`) and read `usage.cost` when it is present.
   - Also export `chatText()` for free-form answers (Q&A).
5. `speech.ts`: `synthesizeSpeech({ model, voice, input, format: 'mp3'|'pcm', speed?, instructions?, signal? }) → { audio: ArrayBuffer, contentType, costUsd|null }`. Reject input over a configurable max length (default 4,000 chars) before calling.
6. `pdf.ts`: `parsePdf({ base64, fileName, engine: 'cloudflare-ai'|'mistral-ocr', model })` → plain text, via chat/completions with a file part and the `file-parser` plugin, per R1. The engine is always explicit.
7. `cost.ts`: a pure estimator.
   - `estimateChatCost(model, promptTokens, completionTokens)`
   - `estimateSpeechCost(model, chars)`, which handles both per-character pricing and per-audio-token pricing (use the R1 assumptions: 25 audio tokens per second, ~15 chars per second of speech; document them in code)
   - `formatUsd(n)`, which shows "< $0.01" for tiny amounts and 2–3 significant digits otherwise
8. Tests (mock fetch, **no network**): headers, error mapping for each status, retry/backoff, abort, zod validation, the repair path (first response invalid, second valid), JSON fence stripping, speech length guard, cost math for each pricing style, and a guarantee that the key never appears in thrown error messages (assert on a fake key string).

## Constraints
- **Dependencies are already installed** (`zod`, `zod-to-json-schema` if zod is v3). Do not run `npm install`.
- Only touch `src/services/openrouter/**` and the Jest project entry.

## Acceptance
`npm run typecheck`, `npm run lint` and `npm test` pass (paste the tails). The report lists the public API signatures.
