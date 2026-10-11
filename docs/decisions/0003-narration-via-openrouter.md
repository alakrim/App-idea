# ADR-0003: Narration through OpenRouter `/audio/speech`, with an offline device-voice mode

**Status**: accepted (2026-10-11). Evidence: `docs/research/R1-openrouter.md`. The architect independently verified the live catalog (32 speech models) and the `/audio/speech` path in openapi.json.

## Decision
- All narration goes through `POST https://openrouter.ai/api/v1/audio/speech` using the user's key. The request is `{model, input, voice, response_format, speed, instructions?}` and the response is raw audio bytes. We request **mp3** for storage efficiency.
- **The voice catalog is live**: `GET /api/v1/models?output_modalities=speech` gives `supported_voices` and pricing. Never hard-code a model list. Ship only a *recommended* default per tier with graceful fallback when it disappears from the catalog. R1 observed `gpt-4o-mini-tts` vanish.
- Tiers shown in the voice picker. Costs are per hour of narration (about 54k chars) and are recomputed live from pricing:
  - **Budget**: `hexgrad/kokoro-82m` (~$0.03/h, limited languages)
  - **Recommended**: `google/gemini-3.8-flash-lite-tts` (~$0.5/h, `instructions` steering such as "warm audiobook narrator, measured pace", 30 voices)
  - **Premium**: ElevenLabs v3/v4 (~$2/h)
- **Voice preview**: a fixed ~15-word sample per (model, voice, language), synthesized on demand and cached on disk.
- **Device voice mode** (free, offline): `expo-speech` speaks live, sentence by sentence. It cannot render to a file, so no ambience ducking precision and no export, but it keeps the app useful with zero spend.
- **PDF**: extract on device first ([R3]). The fallback is the OpenRouter file-parser with an **explicit** engine: `cloudflare-ai` (free) for text PDFs, and `mistral-ocr` ($2 per 1,000 pages) for scans, which needs a cost confirmation.
- **Key check**: `GET /api/v1/key` validates the key and shows the limit/usage. `/credits` needs a management key, so we show "usage" from `/key` and our own ledger.
- Every request sends the `HTTP-Referer: https://lectio.app` and `X-Title: Lectio` headers.

## Risks
- Per-language quality is unverified. Add a paid A/B listening test (gated on user approval of spend, ~$0.20).
- Price unit semantics differ by model (per char vs per audio token). Cost estimation must handle both, and the ledger records the actual `usage` returned.

## Amendment (2026-10-11): default voice chosen by the user after the live audition
- **Default narrator for every language: `google/gemini-3.8-flash-lite-tts`, voice `Kore`, style "Warm, intimate audiobook narrator. Measured pace, natural pauses at commas and full stops."** The user picked it by ear over Kokoro, MAI 2.1 Flash and ElevenLabs v3 (https://claude.ai/artifact/R3d3Rxb42W5rm1hn6wqhJp).
- Gemini TTS is **PCM-only**, so synthesis requests `pcm` and stores WAV until **E1** (native AAC encoder) lands. E1 is now a priority because of storage (~170 MB/h WAV vs ~20 MB/h AAC).
- Kokoro stays the Budget tier and ElevenLabs v3 the Premium tier in the picker.
