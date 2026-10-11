# Brief R1: OpenRouter capability research

**Type**: research. No code. Today is 2026-10-11, so prefer sources from 2026 and flag anything older than 6 months as possibly stale.

## Goal
Lectio calls every model through **OpenRouter** with the user's own API key, straight from the phone, with no backend. We need the facts that will drive the architecture.

## Questions (answer every one, with source URLs)
1. **Text to speech / audio output.** Can OpenRouter produce speech today?
   - Is there a dedicated endpoint (e.g. `/api/v1/audio/speech`) or is it chat completions with `modalities: ["text","audio"]` / an `audio` param?
   - Which models (exact slugs)? Which voices? Output formats (mp3/wav/pcm16/opus)? Does it support streaming? Is there a max input length?
   - What does it cost per 1M characters or per minute of audio?
   - Can a voice be steered (emotion, pace, "narrate like an audiobook narrator") by instructions?
   - Is quality good for **many languages** (Italian, Portuguese, Mandarin, Japanese, Spanish, French, German at minimum)?
   - If OpenRouter cannot do TTS well, list the best alternatives a mobile app could call directly with a separate key (OpenAI TTS `gpt-4o-mini-tts`, ElevenLabs, Google Gemini TTS, Azure, Cartesia...), with price, languages and API shape. Also evaluate **on-device** TTS (Android TextToSpeech / iOS AVSpeechSynthesizer via `expo-speech`) as a free fallback.
2. **PDF input.** OpenRouter's file/PDF support: the request shape, the `file-parser` plugin engines (`pdf-text`, `mistral-ocr`, `native`), the cost of each, page and size limits, and whether we can get plain text back cheaply.
3. **Models API.** `GET /api/v1/models`: the response fields we need (id, name, pricing.prompt/completion/audio, context_length, architecture.input_modalities/output_modalities). Can we filter for audio-output models?
4. **Key validation and credits.** Which endpoint validates a key and returns remaining credits or limits (`/api/v1/key`, `/api/v1/credits`)? Give the response shape.
5. **Structured output.** Support for `response_format: {type: "json_schema"}` and which cheap models honor it. Also prompt caching on OpenRouter (which providers, how to enable it).
6. **Embeddings.** Does OpenRouter have an embeddings endpoint? Which models, at what price?
7. **Cheap, capable models** for (a) content cleanup, (b) analysis into JSON, (c) literary translation. Recommend 2–3 for each with price per 1M tokens and why.
8. **Rate limits, CORS and mobile usage.** Are there issues with calling from a React Native app? Which headers are recommended (`HTTP-Referer`, `X-Title`)?

## Deliverable
Write `docs/research/R1-openrouter.md`:
- TL;DR (≤10 bullets) with a recommendation for the narration strategy.
- One section per question, each with sources.
- A table of the request/response shapes we will code against (JSON examples).
- A "Confidence & unknowns" section.

Do not modify any other file. Do not call any paid endpoint. Public docs only.
