# ADR-0006: LLM output contracts and error codes

**Status**: accepted (2026-10-11)

## Decision
1. **Strict json_schema everywhere.**
   - Every zod schema used as an LLM output schema has all properties required. Absent values are expressed as `.nullable()`, never `.optional()`.
   - After parsing, `stripNulls()` restores clean domain objects.
   - A test walks `z.toJSONSchema(schema, { io: 'output' })` and asserts `required` covers every key and `additionalProperties: false`.
2. **Typed cue items in the schema.** Cue items must be described fully, with nullable fields, in the JSON schema sent to the model. Do not use `z.unknown()`, so that structured-output decoding constrains them. `validateCues` stays the semantic gate.
3. **Error codes.** `ErrorCode` lives only in `src/core/domain/pipeline.ts`. `INPUT_TOO_LONG` (non-retryable) is added. A 402 caused by OpenRouter's in-flight budget maps to a retryable `RATE_LIMITED`.
4. **Transport v2** (to implement in the pipeline brief): `LlmTransport` returns `{text, usage}` and accepts `{jsonSchema?, signal?}`, so real cost flows into the ledger and in-flight calls can be aborted.
