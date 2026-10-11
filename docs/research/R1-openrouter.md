# R1: OpenRouter capabilities for Lectio

**Date**: 2026-10-11 · **Brief**: `docs/briefs/R1-openrouter-capabilities.md` · **Type**: research, no code

**Evidence labels used below**
- **[Verified]**: seen in an official OpenRouter/vendor page, the OpenAPI spec, or a live public API response (queried 2026-10-11).
- **[Derived]**: my arithmetic on verified numbers. The formula is shown.
- **[Inference]**: my reasoning, not stated by any source.
- **[Unverified]**: a claim I could not confirm. Do not build on it without a check.

Source IDs `[S#]` are listed at the end. Live catalog results came from unauthenticated public GETs. No paid endpoint was called and no API key was used.

---

## TL;DR

- **Narration is possible through OpenRouter.** A dedicated speech endpoint exists: `POST /api/v1/audio/speech`. It returns raw `mp3` or `pcm` bytes and takes the user's own key [S3][S11]. The live catalog lists 32 speech models today [S12].
- **Recommended narration strategy:** use OpenRouter as the single BYOK path for narration. Default to `google/gemini-3.8-flash-lite-tts`, the cheapest TTS model with documented `instructions` (tone/pacing) steering. Its 2026 cost is about $0.009 per audio minute [Derived]. Offer `elevenlabs/eleven-v4` as a premium tier. Keep on-device `expo-speech` as the free offline fallback only, since it cannot write audio to a file [S20].
- **Do not hard-code `openai/gpt-4o-mini-tts-2025-12-15`.** The OpenRouter docs use it as the example [S3], but it is absent from the live speech catalog today [S12].
- **PDF input works through chat completions** with a `file` content part and `plugins: [{id: "file-parser", pdf: {engine}}]` [S2]. Engine costs: `cloudflare-ai` is free (`pdf-text` is a deprecated alias for it), `mistral-ocr` is $2 per 1,000 pages, and `native` is billed as input tokens [S2]. **Always set the engine explicitly**: if omitted, the default is `native` or `mistral-ocr`, and the latter costs money. No page or size limits are documented [S2].
- **Models API** (`GET /api/v1/models`) returns per-unit `pricing`, `architecture.input_modalities`/`output_modalities`, `supported_parameters`, and `supported_voices`. Filter with `output_modalities=speech|embeddings|audio`. The default listing is text-only [S11][S12].
- **Key validation:** `GET /api/v1/key` works with a normal user key and returns `limit`, `limit_remaining`, `usage`, and budget fields [S11]. `GET /api/v1/credits` requires a **management key** [S11], so a BYOK user cannot read their account balance.
- **Structured output:** `response_format: {type: "json_schema", ...}` is supported. Filter for `structured_outputs` in `supported_parameters`. Enforcement varies by endpoint, so validate with zod [S7]. Cheap JSON-capable candidates are in section 7.
- **Caching:** automatic for OpenAI, DeepSeek, Gemini 2.5 and others. Explicit `cache_control` for Anthropic, Qwen and Gemini. Pass `session_id` for sticky routing [S6].
- **Mobile calls work:** CORS is open for the API (`access-control-allow-origin: *`), and `HTTP-Referer`, `X-Title` and `X-OpenRouter-Title` are allowed headers [Verified live]. Send `HTTP-Referer` and `X-OpenRouter-Title` [S8].
- **Watch-outs with dates:** `google/gemini-2.5-flash-lite` expires 2026-10-20 [S12]. The ElevenLabs promo price ends 2026-10-12 [S19]. Google's TTS prices double on 2027-01-01 [S18].

---

## 1. Text to speech and audio output

### 1a. Dedicated speech endpoint [Verified]
- `POST https://openrouter.ai/api/v1/audio/speech`, "OpenAI Audio Speech API compatible" [S3]. Operation: "Create speech", returns a raw audio bytestream [S11].
- Request fields (`SpeechRequest`): `model` (required), `input` (required; string, or a list of turns for multi-speaker), `voice`, `instructions`, `response_format` (enum `mp3` | `pcm`, default `pcm`), `speed`, `input_references` (voice cloning), `provider` (`zdr`, `data_collection`, `options` keyed by provider slug), `session_id`, `user`, `trace` [S11].
- Response: `Content-Type: audio/*`. Header `X-Generation-Id` for tracking [S3]. The global CORS config exposes it to browsers [Verified live, on other routes].
- Non-200 responses return JSON error bodies, not audio [S3].
- **Streaming:** the speech endpoint is not documented as streaming. The OpenAI provider option `stream_format: "audio"` may expose streaming [S3]. `pcm` is recommended for real-time pipelines [S3]. For our file-based pipeline, use `mp3`.
- **`voice`:** required for most models. It can be omitted only if the provider documents a default voice [S3].
- **`instructions`:** the spec says "Supported by OpenAI gpt-4o-mini-tts and Gemini TTS models. Ignored by other providers." [S11]. This is the only documented steering control. ElevenLabs steering is via inline audio tags in the text, per its catalog description [S12][Inference on how it passes through].
- **Input length:** no general limit documented [S3]. Per model: Seed Audio 1.0 is capped at 3,000 characters [S3]. Catalog `context_length` is 32,768 for Gemini TTS, and 4,096 for Voxtral, Kokoro, Orpheus and CSM [S12]. Read this as a token limit [Inference]. ElevenLabs' description mentions "a 10,000-character..." (truncated in the catalog) [S12].

**Speech models live today (32)** [S12, verified with `GET /api/v1/models?output_modalities=speech`]

| Slug | Price in catalog (`pricing.prompt`) | Unit | Voices (examples) | Languages (as stated) |
|---|---|---|---|---|
| `google/gemini-3.8-flash-lite-tts` | 0.0000005 in / 0.000006 out | per token | 30 (Zephyr, Puck, Kore, ...) | not stated in catalog |
| `google/gemini-3.8-flash-tts` | 0.0000005 in / 0.000009 out | per token | same 30 | not stated |
| `google/gemini-3.1-flash-tts-preview` | 0.000001 in / 0.00002 out | per token | same 30 | not stated |
| `elevenlabs/eleven-v4` | 0.00004 | per char [Inference] | 21 (george, sarah, adam, ...) | "90+ languages" |
| `elevenlabs/eleven-v4-turbo` | 0.00002 | per char [Inference] | same 20 | not stated |
| `microsoft/mai-voice-2.1` | 0.000022 | per char [Inference] | 97 locale-prefixed IDs | "23 languages" |
| `mistralai/voxtral-mini-tts-2603` | 0.000016 | per char [Inference] | 30 (`en_paul_*`, `gb_*`, `fr_marie_*`) | "multilingual" |
| `deepgram/aura-2` | 0.00003 | per char [Inference] | 90 locale-suffixed IDs | "multilingual" |
| `hexgrad/kokoro-82m` | 0.00000062 | per char [Inference] | 54 (af_, am_, bf_, ...) | 8 languages (en-US/GB, es, fr, hi, it, ja, pt, zh) |
| `fish-audio/s2.1-pro` | 0.000015 | per char [Inference] | none listed | "multilingual" |
| `x-ai/grok-voice-tts-1.0` | 0.000015 | per char [Inference] | eve, ara, rex, sal, leo | not stated |
| `minimax/speech-2.8-hd` | 0.0001 | per char [Inference] | 45 (English) | not stated |
| `bytedance-seed/seed-audio-1-0` | completion 0.0025 | per second of audio [S3] | cloning | not stated |

Plus `microsoft/mai-voice-2`, `mai-voice-2-flash`, `mai-voice-2.1-flash`, `deepgram/flux-tts`, `fish-audio/s1`, `fish-audio/s2-pro`, `fish-audio/s2.1-pro-free:free`, `qwen/qwen-audio-3.0-tts-flash|plus`, `minimax/speech-2.8-turbo`, `canopylabs/orpheus-3b-0.1-ft`, `sesame/csm-1b`, and `elevenlabs/*` older variants [S12].

**Not found in live catalog:** `openai/gpt-4o-mini-tts-2025-12-15`, `openai/tts-1`, `openai/tts-1-hd`. The OpenRouter TTS guide uses the first as its example [S3]. A third-party search result claimed "$0.60 per million characters" for it on OpenRouter [Unverified: that page is not in the live catalog, and OpenAI's own pricing is token-based, see 1f].

**Voices:** the voice list is in the catalog's `supported_voices` field per model [S12]. Use it for the picker. Do not hard-code voice names.

### 1b. Audio output via chat completions [Verified]
- `POST /api/v1/chat/completions` with `modalities: ["text","audio"]`, `audio: {voice, format}` and `stream: true`. Audio arrives as SSE chunks in `choices[0].delta.audio` (`data` base64 fragments and `transcript` fragments). A `[DONE]` line ends the stream [S1].
- Voices: alloy, echo, fable, onyx, nova, shimmer. Formats: wav, mp3, flac, opus, pcm16 (availability varies by model) [S1].
- Audio-output models in the live catalog: `openai/gpt-audio` and `openai/gpt-audio-mini`, plus `google/lyria-3-*` (output modality `audio`; not evaluated) [S12, live `GET /api/v1/models`].
- This route is useful only as a fallback. It is heavier than the TTS endpoint (see 1f).

### 1c. Multi-language quality
- **Not verified.** I did not run any paid speech calls, so I have no quality measurements. The stated language coverage is in the table above and comes from catalog descriptions [S12], not from tests.
- Kokoro covers 8 languages [S12]. ElevenLabs v4 claims 90+ [S12]. MAI-Voice-2.1 claims 23 [S12]. Gemini TTS language coverage is **not stated** on OpenRouter or in the Google pricing page I fetched [Unverified].
- **Action:** run a blind listening test on Italian, Portuguese, Mandarin, Japanese, Spanish, French and German before choosing the default. This is the only way to answer quality for our languages.

### 1d. Steering ("narrate like an audiobook narrator") [Verified for the mechanism, Unverified for quality]
- `instructions` is documented for OpenAI `gpt-4o-mini-tts` and Gemini TTS [S11]. The OpenAI guide describes it as controlling "accent, emotion, intonation, speed, tone, and whispering" [S17].
- Gemini TTS also supports multi-speaker `input` as a list of `{text, voice, instructions}` turns. Other providers return 400 [S3]. This is useful for dialogue passages.
- ElevenLabs uses inline audio tags in the text [S12].

### 1e. Output formats
- OpenRouter speech: `mp3` or `pcm` only [S11]. Content-Type `audio/mpeg` for mp3 and `audio/pcm` for pcm [S3].
- OpenAI direct: mp3, opus, aac, flac, wav, pcm (pcm is 24 kHz, 16-bit signed LE, no header) [S17].

### 1f. Cost per audiobook hour
Assumption for all per-hour figures [Inference]: about 150 words per minute, about 6 characters per word including spaces, so **about 54,000 characters per hour**. Gemini's cost is token-based, so its per-hour figure also includes a small text-input cost.

Gemini TTS is priced per token. Google states audio tokens are 25 per second of audio [S18]. That gives 1,500 audio tokens per minute.

| Option | Source price | Per audio minute | Per audio hour | Source |
|---|---|---|---|---|
| Gemini 3.8 Flash-Lite TTS (OpenRouter or Google) | $6 per 1M output audio tokens (2026); $12 from 2027 | **$0.009** (2026); $0.018 (2027) [Derived] | **~$0.55** (2026) [Derived] | [S18], catalog [S12] |
| Gemini 3.8 Flash TTS | $9 per 1M audio tokens (2026); $18 from 2027 | $0.0135 (2026) [Derived] | ~$0.81 (2026) [Derived] | [S18] |
| Gemini 3.1 Flash TTS Preview | $20 per 1M audio tokens | $0.03 [Derived] | ~$1.80 [Derived] | [S18] |
| OpenAI `tts-1` (direct) | $15 per 1M characters | n/a | ~$0.81 [Derived] | [S16] |
| OpenAI `tts-1-hd` (direct) | $30 per 1M characters | n/a | ~$1.62 [Derived] | [S16] |
| OpenAI `gpt-4o-mini-tts` (direct) | $0.60 per 1M text tokens in; $12 per 1M audio tokens out | **Not verified** (no per-minute figure on the page) | n/a | [S16] |
| ElevenLabs v4 (direct) | List $0.08 per 1K chars ($80 per 1M); promo $22 per 1M until 2026-10-12 | n/a | $4.32 at list; $1.19 at promo [Derived] | [S19] |
| ElevenLabs v4 (via OpenRouter catalog) | $0.00004 per char = $40 per 1M | n/a | ~$2.16 [Derived] | [S12] |
| Voxtral Mini TTS (via OpenRouter catalog) | $0.000016 per char = $16 per 1M | n/a | ~$0.86 [Derived] | [S12] |
| Cartesia Sonic (direct) | 1 credit per character; 750-800 credits per minute; overage $38-65 per 1M credits | n/a | ~$1.7-3.1 at overage [Derived] | [S22] |
| Azure AI Speech (direct) | Billed per character; free tier 0.5M chars per month. **Rates not captured.** | n/a | [Unverified] | [S21] |
| `openai/gpt-audio` (chat audio, via OpenRouter) | $32 per 1M audio input tokens; $64 per 1M audio output tokens | n/a | not calculated | [S12], [S16] |
| On-device (`expo-speech`) | Free | free | free | [S20] |

Note on the ElevenLabs gap: the catalog price ($40/M) matches neither the list price ($80/M) nor the promo ($22/M). I cannot explain it from public sources [Unverified].

Units: for token-priced models, the catalog `pricing.prompt`/`completion` values are USD per token. Gemini's catalog rates match Google's published per-1M rates exactly: $1 input and $20 output for `gemini-3.1-flash-tts-preview` [S18][S12]. So I treat the catalog as per-token. For character-priced models, "per character" is an inference from the TTS guide's statement that most models are priced per character [S3].

### 1g. Recommendation for narration
1. **Default:** `google/gemini-3.8-flash-lite-tts` on OpenRouter, `response_format: "mp3"`, with `instructions` set to a narrator style. It is the cheapest verified option with documented steering. Verify language quality first (1c).
2. **Premium tier:** `elevenlabs/eleven-v4` on OpenRouter. It has the widest stated language coverage and expressive tags. Its steering works through text tags, not `instructions` [S12].
3. **Fallback:** `expo-speech` for offline or free preview only. It can speak but cannot save audio to a file [S20]. Caching narration on device would need a native module that calls Android's `TextToSpeech.synthesizeToFile` [S23] or iOS `AVSpeechSynthesizer.write(_:toBufferCallback:)` [S24].
4. **Cache the mp3s on device,** keyed by text hash plus model and voice, so a re-listen costs nothing [Inference, cost reasoning].
5. **Direct-key alternatives,** if OpenRouter quality or languages fail the listening test: OpenAI `gpt-4o-mini-tts` (token-priced; per-minute unverified), ElevenLabs direct (list $80 per 1M chars), Cartesia (~$1.7-3.1 per hour at overage), Azure (rates unverified). Each needs its own key in the app.

---

## 2. PDF input [Verified]

### Request shape [S2]
```json
{
  "model": "anthropic/claude-sonnet-4",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "Extract the main content."},
      {"type": "file", "file": {
        "filename": "chapter.pdf",
        "file_data": "data:application/pdf;base64,<BASE64_PDF>"
      }}
    ]
  }],
  "plugins": [{"id": "file-parser", "pdf": {"engine": "cloudflare-ai"}}]
}
```
- `file_data` can be a base64 data URL or a public URL. The TypeScript SDK uses `fileData`.
- The feature works on any OpenRouter model [S2].

### Engines [S2]
| Engine | What it does | Cost |
|---|---|---|
| `cloudflare-ai` | PDF to markdown via Cloudflare Workers AI | **Free** |
| `mistral-ocr` | Best for scans and image-heavy PDFs | **$2 per 1,000 pages**; $2.20 when pinned to US region |
| `native` | Only for models with native file input; sent directly to the model | Charged as input tokens |
| `pdf-text` | **Deprecated**, redirects to `cloudflare-ai` | Same as `cloudflare-ai` |

- Default when `engine` is omitted: the model's native file support if available, otherwise `mistral-ocr` [S2]. So omitting it can cost money silently.
- OCR fees apply even with BYOK, because OpenRouter bills OCR through its own Mistral key [S2].

### Limits and plain text
- **Page and file-size limits: not documented** [S2]. The only documented limit is 8 images per PDF forwarded to the downstream model with `mistral-ocr` [S2].
- **Plain text back:** there is no separate text field. Parsed content is in `choices[0].message.annotations`, where `type: "file"` entries hold `file.content` parts. Collect `text` parts [S2]. Pass the annotations back in later turns to skip re-parsing. Deduplicate by `file.hash` [S2].
- **Inference:** the parsed text goes to the downstream model, so model input tokens may still be billed on top of the parser fee. The docs do not say this explicitly. Measure with the `usage` field before we rely on "free".

**Recommendation:** pass `engine: "cloudflare-ai"` for normal text PDFs (free). Use `mistral-ocr` only for scanned pages and check for empty text output as the trigger for that fallback. Store the annotation hash for re-use.

---

## 3. Models API [Verified]

`GET https://openrouter.ai/api/v1/models` (public, no key needed).

Top-level: `{data: [...], total_count, links: {next}}`. The default `output_modalities` is `text` [S11].

Fields per model (live, example `elevenlabs/eleven-v4`):
```json
{
  "id": "elevenlabs/eleven-v4",
  "canonical_slug": "elevenlabs/eleven-v4-20260930",
  "name": "ElevenLabs: Eleven v4",
  "created": 1791386285,
  "description": "...",
  "context_length": 0,
  "architecture": {
    "modality": "text->speech",
    "input_modalities": ["text"],
    "output_modalities": ["speech"],
    "tokenizer": "Other",
    "instruct_type": null
  },
  "pricing": {"prompt": "0.00004", "completion": "0"},
  "top_provider": {},
  "per_request_limits": null,
  "supported_parameters": [],
  "default_parameters": {},
  "supported_voices": ["george", "sarah", "adam"],
  "knowledge_cutoff": null,
  "expiration_date": null,
  "links": {}
}
```
- **`pricing` keys across the catalog:** `prompt`, `completion`, `audio`, `audio_output`, `image`, `image_output`, `input_audio_cache`, `input_cache_read`, `input_cache_write`, `input_cache_write_1h`, `internal_reasoning`, `overrides`, `web_search` [Verified, live full catalog of 458 models].
- **`architecture.output_modalities`** values seen: `text`, `image`, `audio`, `speech`, `embeddings`. `input_modalities`: `text`, `image`, `audio`, `file`, `video` [Verified].
- **Filters:** `output_modalities` (comma list, incl. `speech`, `embeddings`, `audio`, `transcription`, `all`), `input_modalities`, `supported_parameters`, `sort` (`pricing-low-to-high`, `context-high-to-low`, ...), `context` (min), `min_price`/`max_price` ($/M prompt tokens), `q`, `limit`/`offset` (max 1000) [S11].
- **Counts (live):** 458 text models (default). 32 speech. 33 embeddings (`GET /api/v1/embeddings/models`) [Verified].
- **Caveat:** an automated summarizer fetch of `/api/v1/models` returned a different, non-OpenRouter schema (`display_name`, `max_input_tokens`). The direct `curl` result matches the OpenAPI spec. Trust the direct response and the spec, not the summary.

---

## 4. Key validation and credits [Verified from OpenAPI]

### `GET /api/v1/key` (user key) [S11]
Returns `data` with: `label`, `limit` (null means no cap), `limit_remaining`, `limit_reset`, `usage`, `usage_daily`, `usage_weekly`, `usage_monthly`, `byok_usage*`, `budgets[]`, `effective_budget`, `is_free_tier`, `free_model_daily_requests {used, limit, remaining}`, `include_byok_in_limit`, `is_management_key`, `is_provisioning_key`, `expires_at`, `allowed_data_regions`, `rate_limit` (deprecated; ignore). Example from spec:
```json
{"data": {"label": "sk-or-v1-au7...890", "limit": 100, "limit_remaining": 74.5,
  "limit_reset": "monthly", "usage": 25.5, "is_free_tier": false,
  "is_management_key": false, "budgets": [], "effective_budget": null}}
```
- Unauthenticated call: HTTP 401 `{"error":{"message":"No cookie auth credentials found","code":401}}` [Verified live].

### `GET /api/v1/credits` [S11]
- Returns `{data: {total_credits, total_usage}}`.
- **Requires a management key.** A regular key gets 403 `"Only management keys can perform this operation"` [S11].
- **Consequence [Inference]:** the app cannot read a BYOK user's account balance. It can show the key's `limit`/`limit_remaining` and `usage`, which cover only key-level caps.

### Budgets and 402/403 semantics [S5][S10]
- 402 `error.metadata.limit_source`: `openrouter_in_flight_budget` (retry after `Retry-After`), `openrouter_key_limit`, `openrouter_credits` (balance cannot cover request).
- 403 with `limit_source` `openrouter_guardrail_budget`, `openrouter_workspace_budget`, or `openrouter_key_limit`. Budgets reset at 00:00 UTC [S5].

---

## 5. Structured output and prompt caching

### Structured output [S7]
```json
{
  "model": "deepseek/deepseek-v4-flash-0731",
  "messages": [{"role": "user", "content": "..."}],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "chapter_analysis",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {"summary": {"type": "string", "description": "..."}},
        "required": ["summary"],
        "additionalProperties": false
      }
    }
  },
  "provider": {"require_parameters": true}
}
```
- **Support check:** filter the models list for `supported_parameters` containing `structured_outputs` [S7][S12]. Support is determined per endpoint, and can change over time [S7].
- **Enforcement varies:** some endpoints guarantee the schema, others translate it or treat it as a hint. `strict: true` helps only where the provider has a native strict mode [S7].
- **Routing:** set `provider.require_parameters: true` so OpenRouter only uses endpoints that support the parameter [S7]. Unsupported model returns an error. An invalid schema returns an error [S7].
- **Streaming** with `stream: true` streams valid partial JSON [S7]. Response Healing applies only to non-streaming `json_schema` requests [S7].
- **Recommendation:** still validate the output with zod on the client, as CLAUDE.md requires [S7][Inference].

### Prompt caching [S6]
- **Automatic (no config):** OpenAI, Grok, Moonshot, Groq (Kimi K2), DeepSeek, Z.AI, and Gemini 2.5 implicit caching [S6].
- **Explicit `cache_control` breakpoints:** Anthropic Claude (up to 4 breakpoints; 5-minute TTL by default, `"ttl": "1h"` available) and Alibaba Qwen [S6].
- **Gemini explicit:** `cache_control` in content; only the last breakpoint is used; 5-minute TTL [S6].
- **OpenAI explicit:** `prompt_cache_breakpoint` and `prompt_cache_options`, only for GPT-5.6 and newer [S6].
- **Minimum prompt sizes:** OpenAI 1,024 tokens; Gemini 1,024 (2.5 Flash) or 4,096 (2.5 Pro); Anthropic 512 to 4,096 depending on model [S6].
- **Sticky routing:** pass `session_id` (body or `x-session-id` header, max 256 chars) so follow-up requests reach the same provider. Sessions expire after 10 minutes of inactivity [S6].
- **Verify hits:** usage fields `cached_tokens` and `cache_write_tokens`; `cache_discount` in the response; or `GET /api/v1/generation` [S6].
- **Catalog check:** DeepSeek V4 Flash 0731 has `input_cache_read` equal to its input price ($0.018/M), so no cache discount there [Verified live]. Gemini 2.5 Flash Lite cache read is $0.01/M [Verified live].
- **BYOK caching behaviour:** not covered by the page I fetched [Unverified].

---

## 6. Embeddings [Verified]

- `POST https://openrouter.ai/api/v1/embeddings` [S9][S11].
- Body: `model` (required), `input` (string, array of strings, or multimodal content parts), `encoding_format` (`float` | `base64`), `dimensions` (integer), `provider` [S11].
- Response: `data[].embedding` arrays [S9]. The spec's full response schema is in the OpenAPI file [S11]. The docs page does not show a full response example [S9].
- **Models: 33 live** [S14]. Cheapest paid options (USD per 1M tokens, live):
  - `qwen/qwen3-embedding-8b`: $0.01 (32k context)
  - `baai/bge-m3`: $0.01 (8,194 context)
  - `openai/text-embedding-3-small`: $0.02 (8,192)
  - `voyageai/voyage-4-lite`: $0.02 (32,000)
  - `openai/text-embedding-3-large`: $0.13 (8,192)
  - `google/gemini-embedding-001`: $0.15 (20,000)
  - Free: `liquid/lfm-2.5-embedding-350m:free`, `nvidia/nemotron-3-embed-1b:free` and others [S14].
- **Recommendation [Inference]:** not needed for the core pipeline. Only needed if we add semantic search over chapters for the Q&A feature. At these prices, the cost is negligible.

---

## 7. Cheap, capable models

Pricing below is the live catalog, USD per 1M tokens [S12]. AA index is the Artificial Analysis intelligence index as carried in the catalog's `benchmarks` field [S12]. It is a snapshot and is not a translation benchmark.

### (a) Content cleanup (strip ads/nav, keep the body)
| Model | In / Out per 1M | Context | Structured output | Notes |
|---|---|---|---|---|
| `openai/gpt-5-nano` | $0.05 / $0.40 | 400k | yes | AA 13. Low cost, large context, structured output. Good for extraction. (`openai/gpt-oss-20b` is cheaper at $0.018 / $0.09 with structured output, but unbenchmarked here.) |
| `qwen/qwen3.5-flash-02-23` | $0.065 / $0.26 | 1M | yes | No AA index in catalog. |
| `mistralai/mistral-small-3.2-24b-instruct` | $0.094 / $0.25 | 256k | yes | Knowledge cutoff 2023. Fine for cleanup. |

**Pick:** `openai/gpt-5-nano`, with `mistral-small-3.2` as an alternate. Validate the cleanup output on a sample of real pages.

### (b) Analysis into JSON (chapter memory, ambience cues)
| Model | In / Out per 1M | Context | AA index | Notes |
|---|---|---|---|---|
| `deepseek/deepseek-v4-flash-0731` | $0.018 / $0.64 | 1M | 34.3 (coding 69.1, agentic 41) | Automatic caching, no cache discount. Output is the expensive part. |
| `anthropic/claude-haiku-5.5` | $0.10 / $0.50 | 1M | 43.4 | Strongest cheap option by AA. Explicit caching ($0.01 read, $0.125 write per 1M). |
| `google/gemini-3.5-flash-lite` | $0.30 / $2.50 | n/a | 22.2 | Mid price. |

**Pick:** `anthropic/claude-haiku-5.5` for quality, `deepseek/deepseek-v4-flash-0731` for lowest cost. Keep `google/gemini-2.5-flash-lite` out: it expires 2026-10-20 [S12].

### (c) Literary translation
| Model | In / Out per 1M | AA index | Notes |
|---|---|---|---|
| `anthropic/claude-haiku-5.5` | $0.10 / $0.50 | 43.4 | Top of the cheap tier by AA. |
| `google/gemini-3.8-flash` | $0.75 / $3.75 | 40.9 | Premium option for hard passages. |
| `deepseek/deepseek-v4-flash-0731` | $0.018 / $0.64 | 34.3 | Cheapest. |

**Caveat [Inference]:** the AA index measures general capability, not literary translation quality or the languages we need. Run an in-house eval on 2 or 3 real chapters per target language before committing.

---

## 8. Rate limits, CORS and mobile usage

### Rate limits [S5]
- Free models (IDs ending `:free`): 20 requests per minute. Daily cap depends on lifetime credits purchased: 50 per day under 10 credits, 1,000 per day at 10 or more [S5].
- 429 errors may come from OpenRouter or the upstream provider. Honor `Retry-After` and use exponential backoff. Platform 429s include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Successful responses do not include these headers [S5].
- 503 means no provider meets routing requirements; may include `Retry-After` [S10].
- 402 without `limit_source: openrouter_in_flight_budget` should not be retried on a timer [S10].
- Multiple keys do not raise limits: "we govern capacity globally" [S5].

### CORS [Verified live]
- Preflight `OPTIONS /api/v1/chat/completions` with `Origin` returns `access-control-allow-origin: *`, `access-control-allow-methods: GET,OPTIONS,PATCH,DELETE,POST,PUT`, and allowed headers including `Authorization`, `Content-Type`, `HTTP-Referer`, `X-Title`, `X-OpenRouter-Title`, `X-OpenRouter-Categories`, `Idempotency-Key`.
- `access-control-expose-headers: X-Generation-Id, X-Provider-Name, request-id, cf-ray` (seen on the chat preflight and the models GET; the global CORS config applies to the speech endpoint too [Inference]).
- OpenRouter's error doc lists "CORS" as a 400 cause [S10]. That is relevant only to browser-origin requests (web builds).
- **Native apps:** React Native's `fetch` does not enforce browser CORS [Inference, not from a source]. Mobile calls should not be blocked. Verify on a device.

### Attribution headers [S8]
- `HTTP-Referer`: the app's URL, used as its ID. "The primary identifier for rankings" [S8]. Required for attribution.
- `X-OpenRouter-Title`: display name. Needed for localhost. `X-Title` is the legacy name and still supported [S8].
- `X-OpenRouter-Categories` (up to 2, lowercase, hyphenated) and `X-OpenRouter-App-Visibility: hidden` are optional [S8].
- **For Lectio:** send `HTTP-Referer` (a URL we own, or a placeholder until we have one) and `X-OpenRouter-Title: Lectio`. Set `X-OpenRouter-App-Visibility: hidden` if we do not want public ranking [S8][Recommendation].

### Mobile key handling [Recommendation]
- Calls go straight from the phone. The user's key therefore lives on the device. Store it in the platform secure store (for example `expo-secure-store`), never in logs or in source. Mock the network in tests, as CLAUDE.md requires.

---

## Request and response shapes we will code against

| Purpose | Method and path | Key request fields | Response |
|---|---|---|---|
| Narration | `POST /api/v1/audio/speech` | `model`, `input`, `voice`, `instructions`, `response_format` (`mp3`/`pcm`) | Raw audio bytes, `Content-Type: audio/*`, `X-Generation-Id` header [S3][S11] |
| PDF text | `POST /api/v1/chat/completions` | `messages[].content[] = {type:"file", file:{filename, file_data}}`, `plugins:[{id:"file-parser", pdf:{engine}}]` | `choices[0].message.annotations[].file.content[].text` [S2] |
| Structured JSON | `POST /api/v1/chat/completions` | `response_format:{type:"json_schema", json_schema:{name, strict, schema}}`, `provider.require_parameters:true` | `choices[0].message.content` (JSON string; validate with zod) [S7] |
| Model list | `GET /api/v1/models?output_modalities=speech` | `output_modalities`, `supported_parameters`, `limit`, `offset` | `{data:[{id,name,pricing,architecture,supported_voices,...}], total_count, links}` [S11][S12] |
| Key check | `GET /api/v1/key` | `Authorization: Bearer <key>` | `{data:{label,limit,limit_remaining,usage,budgets,is_free_tier,...}}` [S11] |
| Embeddings | `POST /api/v1/embeddings` | `model`, `input`, `dimensions?`, `encoding_format?` | `{data:[{embedding:[...]}]}` [S9] |
| Errors | any | n/a | `{"error":{"code":N,"message":"...","metadata":{...}}}` [S10][S11] |
| Headers | all | `HTTP-Referer`, `X-OpenRouter-Title` | n/a [S8] |

Example speech request:
```json
{
  "model": "google/gemini-3.8-flash-lite-tts",
  "input": "Chapter one. It was a cold morning in the port of Genoa...",
  "voice": "Kore",
  "instructions": "Read like a calm audiobook narrator. Measured pace, warm tone, clear pauses at commas.",
  "response_format": "mp3"
}
```
Voice `Kore` is from the live catalog [S12]. Use the picker, not a hard-coded value.

---

## Direct-provider alternatives (summary)

| Provider | Price | Languages | API shape | Source |
|---|---|---|---|---|
| OpenAI `gpt-4o-mini-tts` | $0.60/M text tokens in; $12/M audio tokens out | Whisper's list; voices optimized for English | `POST /v1/audio/speech`; `instructions`; mp3/opus/aac/flac/wav/pcm; chunked streaming | [S16][S17] |
| ElevenLabs v4 | list $80/M chars; promo $22/M to 2026-10-12 | 90+ (per catalog) | REST, with inline audio tags | [S19][S12] |
| Google Gemini TTS | $0.50 to $1 input, $6 to $20 audio output per 1M tokens | not stated in what I fetched | Gemini API | [S18] |
| Azure AI Speech | per character; 0.5M free chars per month; rates not captured | many | Azure SDK/REST | [S21] |
| Cartesia Sonic | 1 credit per char; plans from $5/mo (100k credits) | not captured | REST/WebSocket | [S22] |
| On-device `expo-speech` | free | device voices | JS API; no file output | [S20] |

---

## Confidence and unknowns

**High confidence (verified in official docs, OpenAPI, or live API):**
- Speech endpoint path, request fields, `mp3`/`pcm` formats, `instructions` support list [S3][S11].
- Speech catalog (32 models) and their units for token-priced models [S12].
- PDF request shape and engine list and costs [S2].
- `/api/v1/key` shape; `/api/v1/credits` needs a management key [S11].
- CORS preflight and headers [Verified live].
- Structured output request shape and `supported_parameters` filter [S7][S12].
- Embeddings path, catalog, prices [S9][S14].

**Medium confidence:**
- Per-hour cost estimates. They rely on 54k characters per hour and 25 audio tokens per second. Re-run with a real chapter.
- ElevenLabs per-char price on OpenRouter. The catalog and official pages disagree.

**Unknown / to verify before we commit:**
1. **Language quality for our target languages** (Gemini TTS especially). No listening test was possible without paid calls. Do the blind test in 1c.
2. **Gemini TTS language coverage** on OpenRouter. Not stated in any page I read.
3. **Whether `instructions` works on the Gemini TTS route** through OpenRouter. The spec says supported, but I did not test it.
4. **Per-minute TTS cost** on OpenRouter for models priced per character. The docs give no per-minute rate.
5. **Max input length** for `/audio/speech` in general. Only Seed Audio (3,000 chars) and token-like `context_length` values are documented.
6. **`gpt-4o-mini-tts` availability.** Used as the doc example but missing from the live catalog today. Could be deprecated or renamed. Check the Models page again before relying on it.
7. **PDF limits and whether non-native engines bill model input tokens.** Not documented. Measure with `usage`.
8. **Prompt caching on BYOK.** Not covered by the page I read.
9. **Literary translation quality.** The AA index does not measure it.
10. **Azure TTS rates.** The pricing page rendered rates as "$-", so I did not capture them.
11. **Android and iOS file-output APIs** come from search snippets and developer forum threads, not the canonical Apple page [S24]. The Apple `write(_:toBufferCallback:)` forum threads are old (2020 to 2023) and report iOS-version bugs [Possibly stale].

**Expiring or time-sensitive items (as of 2026-10-11):**
- `google/gemini-2.5-flash-lite` expires 2026-10-20 [S12].
- ElevenLabs promo ends 2026-10-12 [S19].
- Google TTS prices change on 2027-01-01 (about double) [S18].
- OpenAI pricing page mentions promos through 2026-11-21 [S16]. Not relevant to TTS.

**Sources older than six months** (flagged as possibly stale): the Android TextToSpeech reference page (undated), the Apple forum threads (2020-2023), and the OpenAI TTS guide's voice list (inconsistent: intro says 11 voices, list shows 13) [S17].

---

## Sources

- [S1] OpenRouter, Audio input and output. https://openrouter.ai/docs/guides/overview/multimodal/audio
- [S2] OpenRouter, PDF inputs. https://openrouter.ai/docs/guides/overview/multimodal/pdfs
- [S3] OpenRouter, Text-to-speech guide. https://openrouter.ai/docs/guides/overview/multimodal/tts
- [S4] OpenRouter blog, "New Audio APIs for Speech and Transcription" (published 2026-05-01, updated 2026-07-07). https://openrouter.ai/blog/announcements/announcing-audio-apis/
- [S5] OpenRouter, Limits (rate and credit). https://openrouter.ai/docs/api-reference/limits
- [S6] OpenRouter, Prompt caching. https://openrouter.ai/docs/guides/best-practices/prompt-caching
- [S7] OpenRouter, Structured outputs. https://openrouter.ai/docs/guides/features/structured-outputs
- [S8] OpenRouter, App attribution. https://openrouter.ai/docs/app-attribution
- [S9] OpenRouter, Embeddings. https://openrouter.ai/docs/api-reference/embeddings
- [S10] OpenRouter, Errors. https://openrouter.ai/docs/api-reference/errors
- [S11] OpenRouter, OpenAPI 3.1.0 spec. https://openrouter.ai/openapi.json
- [S12] OpenRouter, live models API (queried 2026-10-11). https://openrouter.ai/api/v1/models and https://openrouter.ai/api/v1/models?output_modalities=speech
- [S13] OpenRouter, live models API, full list (458 text models). https://openrouter.ai/api/v1/models
- [S14] OpenRouter, live embeddings models. https://openrouter.ai/api/v1/embeddings/models
- [S15] OpenRouter, GPT-4o-mini-TTS model page. https://openrouter.ai/openai/gpt-4o-mini-tts-2025-12-15 (page loads; no pricing text parsed)
- [S16] OpenAI, API pricing. https://developers.openai.com/api/docs/pricing
- [S17] OpenAI, Text-to-speech guide. https://developers.openai.com/api/docs/guides/text-to-speech
- [S18] Google, Gemini API pricing. https://ai.google.dev/gemini-api/docs/pricing
- [S19] ElevenLabs, API pricing. https://elevenlabs.io/pricing/api
- [S20] Expo, expo-speech SDK reference. https://docs.expo.dev/versions/latest/sdk/speech/
- [S21] Microsoft Azure, Speech pricing. https://azure.microsoft.com/en-us/pricing/details/speech/
- [S22] Cartesia, pricing. https://cartesia.ai/pricing
- [S23] Android, TextToSpeech reference (via search snippet). https://developer.android.com/reference/android/speech/tts/TextToSpeech
- [S24] Apple, AVSpeechSynthesizer (via search; write method details from forum threads). https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer.md ; https://developer.apple.com/forums/thread/689461

Note: a third-party aggregator page quoting "$0.60 per million characters" for `gpt-4o-mini-tts` on OpenRouter was found in search. It was not used because it conflicts with OpenAI's token-based pricing and is absent from the live catalog.
