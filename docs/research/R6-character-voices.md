# R6: Character voices and expressive delivery, feasibility

_Researched 2026-10-12 by a haiku-worker (brief `docs/briefs/R6-character-voices.md`), saved by the architect. Research only: no paid calls. Scratch simulations are not kept in the repo._

## Summary
Character voices are **feasible**. The value lies in **attribution and delivery**, not in a voice per character.
1. **Attribution is solid for explicit speakers and weak for implicit ones.** Published LLM results: ~87–91% overall on English (PDNC). On Chinese web novels (CSI), ChatGPT reaches 74.5% overall: 80% on explicit quotes, 48% on implicit ones. No published evaluation covers Italian, Spanish or Portuguese.
2. **Cost is not the constraint; requests and resume logic are.** A cast doesn't change $/hour on character- or second-priced models (Gemini Flash-Lite stays ~$0.55/h). It changes the request count.
3. **Delivery is cheap and can be model-agnostic, but only some models can express it.** Gemini takes `instructions`. ElevenLabs and Fish take inline tags. Kokoro and MAI can only express pauses and (unverified) speed.

## Phased plan
| Phase | Scope | Requests/h (Best / Budget) | $ impact | Evidence needed first |
|---|---|---|---|---|
| P1 | Delivery directions, single voice. The analysis call adds a `delivery` array. Gemini gets segment-level `instructions`, Kokoro and MAI pauses only. The segment hash includes a delivery digest. | 193 / 193 (≈100 with cross-paragraph packing) | TTS unchanged; ~$0.004/h extra LLM output | Live probe of per-turn `instructions` and the tag syntax (`<whispers>` vs `[whispers]`); blind A/B |
| P2 | Narrator + 2–4 cast voices. Attribution in the analysis call, mapped to codex entity ids. Gemini 2-speaker requests; Kokoro one request per speaker run. **Resume by hash, not by prefix.** | 109 / 221 | Still $0.55 / $0.03 per hour; one re-narration when the cast is set | Attribution ≥ 90% explicit and ≥ 75% overall on a labelled set; voice consistency; Kokoro French has 1 voice, so no cast there |
| P3 | Full cast, casting UI, "reassign speaker", silence insertion, gender/age in the codex (explicit evidence only), spoiler-safe cast list | as P2 | Reassigning re-narrates only the affected segments (~$0.01 per segment on Best) | Listening test of the reassign flow; labelled attribution eval in CI |

## Cost per narrator (54,000 chars = 1 h; dialogue-heavy simulation through the real `planTtsSegments`)
| Narrator | $/h | Single voice req/h | Cast, 1 voice/request | Cast, 2 speakers/request | Cast + delivery |
|---|---|---|---|---|---|
| Best: Gemini 3.8 Flash-Lite | 0.55 | 193 | 221 | 109 | 109 if per-turn instructions work, else 242 |
| Budget: Kokoro 82M | 0.03 | 193 | 221 | n/a | 242 (speed only, unverified) |
| Free: Fish S2.1 Pro free | 0 | 176 | n/a (no voices) | n/a | 176 (bracket tags) |
| Ref: ElevenLabs v4 | 2.16 | ~193 | 221 | n/a | ~193 (tags) |
| Ref: Gemini 3.8 Flash TTS | 0.82 | 193 | 221 | 109 | 109 |

Other figures:
- Google's TTS prices double on 2027-01-01 (R1), which takes Best to ~$1.09/h.
- Free `:free` models allow 50 requests/day under 10 lifetime credits, and 1,000/day at 10 or more. A 25-min chapter needs ~73 requests, so on the 50 cap the free narrator can't finish a chapter a day.

## 1. Who is speaking (published results)
| Study | Data | Result |
|---|---|---|
| Michel et al., NAACL 2025 (arXiv 2406.11380). Llama-3 8B, zero-shot CoT, gold alias list | PDNC (en) | 90.6 overall, 94.7 explicit |
| Zhong et al., LREC-COLING 2024 "Who Said What". ChatGPT 4-shot | CSI (zh web novels), PDNC, others | CSI 74.5, PDNC 86.9. By type on CSI: explicit 80, anaphoric pronoun 69, other 53, implicit 48 |
| Yang & Wang, SIGHAN 2024 | zh novels | Handle quoted sound effects and unnamed crowds explicitly |
| Gobara et al., WNU 2025 | ja | "approximately 90%" (abstract only) |

**Inside our analysis call.** Add a `speakers` array, only for sentences with a quote or a dialogue dash. It follows ADR-0006: every key is required, nullable rather than optional.
```ts
export type SpeakerRole = 'narrator' | 'character' | 'crowd' | 'sound';
export interface LineSpeaker { readonly idx: number; readonly role: SpeakerRole; readonly name: string | null }
```
- **Prompt cost:** ~600–800 system tokens, in the cached system prompt.
- **Names:** known speaker names come from `buildPriorContext`, which is cutoff-safe. They map to stable ids through `resolveEntities` (`src/core/memory/entities.ts`).
- **Chunk overlap:** take each sentence from the chunk where it sits furthest from an edge.
- **Cold start:** chapter 1 has no codex names, so attribution is weakest there.

## 2. Voice pools (live catalogue)
| Narrator | Voices | Per language |
|---|---|---|
| Gemini 3.8 Flash-Lite | 30, multilingual | every language; 2 speakers per request |
| Kokoro 82M | 54 | en 28, es 3, fr 1 (F), hi 4, it 2, ja 5, pt-BR 3, zh 8 |
| Fish free | 0 | no voice choice, so no cast |
| ElevenLabs v4 | 21 | 90+ languages |
| MAI-Voice-2.1 | 97 locale voices | no Japanese |
| Voxtral | 30 | en, gb, fr only |

## 3. Model capabilities (OpenRouter spec + vendor docs)
OpenRouter `SpeechRequest`:
- `input` is a string **or a list of turns** `{text, voice, instructions}`. Multi-speaker works on "Gemini TTS models only".
- `instructions` is honoured by Gemini (gpt-4o-mini-tts is not in the live catalogue).
- `response_format` is `mp3|pcm`.
- `speed` is "honored by models that support it… other providers either ignore it or return a 400 for a non-default value".

| Model | $/h | Multi-speaker | Instructions | Inline tags | Speed |
|---|---|---|---|---|---|
| gemini-3.8-flash-lite-tts | 0.55 | 2 | yes (request / per turn) | syntax conflict: `<whispers>` (Google) vs `[whispers]` (OpenRouter page) | not documented |
| gemini-3.8-flash-tts | 0.82 | 2 | yes | as above | not documented |
| elevenlabs/eleven-v4 (+turbo, v3) | 2.16 (1.08 turbo) | no | ignored | `[brackets]` | 0.7–1.2 per ElevenLabs; pass-through unverified |
| fish-audio/s2.1-pro(-free) | 0.81 / 0 | Gemini-only via OpenRouter | not documented | `[bracket]` free-form | not documented |
| hexgrad/kokoro-82m | 0.03 | no | no | no | not documented |
| microsoft/mai-voice-2.1 | 1.19 | no | ignored | not documented | not documented |
| deepgram, voxtral, grok, minimax, qwen, orpheus, csm | 0.38–5.40 | no | mostly no | no | not documented |

Important:
- **Gemini reads `input` verbatim**, so directions must go in `instructions` or turn fields, never in the text.
- **The app currently sends `speed` for every model**: a live risk to probe now (ties into N2).

## 3b. Model-agnostic delivery layer
```ts
export const EMOTIONS = ['neutral','joy','sadness','anger','fear','tension','tenderness','humour','awe','irony'] as const;
export interface LineDelivery {
  readonly idx: number; readonly emotion: (typeof EMOTIONS)[number];
  readonly intensity: 'low' | 'medium' | 'high'; readonly pace: 'slow' | 'normal' | 'fast';
  readonly emphasis: readonly string[];          // ≤ 2 substrings of the sentence
  readonly pauseBeforeMs: 0 | 250 | 500 | 1000; readonly pauseAfterMs: 0 | 250 | 500 | 1000;
}
export interface DeliveryAdapter {
  readonly modelId: string; readonly maxVoicesPerRequest: 1 | 2;
  readonly instructions: 'none' | 'per-request' | 'per-turn'; readonly inlineTags: 'none' | 'bracket' | 'angle';
  readonly speed: 'none' | 'per-request';
  render(segment: DeliverySegment): RenderedRequest;
}
```
| Model | Channel | Rendering | Expected gain (delivery / cast, 1–5) |
|---|---|---|---|
| Gemini Flash-Lite / Flash | `instructions` | style per segment (P1), per turn (P2) | 4 / 4 |
| ElevenLabs v4 | inline tags | `[tag]` sentence prefix | 5 / 4 (4× the price) |
| Fish S2.1 | bracket tags | tag prefix | 4 / 1 |
| Kokoro | none | pace → speed (if forwarded), pauses via timeline | 1 / 3 |
| MAI | none | punctuation only | 2 / 4 |

## 4. Engineering impact
- **Planner** (`src/core/text/chunk.ts`): a dialogue paragraph never continues into the next one (`mayContinue` requires `text`). Segments average ~280 chars against the 600 cap. Cross-paragraph packing roughly halves requests, independent of casting. It is a behaviour change and needs a listening test.
- **Resume** (`narrate.ts`): prefix-based today, so an early speaker reassignment re-narrates the whole chapter. Switch to hash-keyed reuse before P2.
- **Hash** must include each speaker run's voice and the delivery digest.
- **`sentenceOffsetsMs`** are estimates. With two voices in one request they are less accurate, and pauses must be added.
- **Player:** fewer, longer files help with the S1 swap-gap risk. Silence insertion is easy in WAV; MP3 needs E1.

## 5. Risks
| Risk | Mitigation |
|---|---|
| Wrong attribution (implicit speech, sound effects) | Narrator fallback when unsure; `sound`/`crowd` roles; reassign action; labelled eval |
| Voice drift (Gemini is stateless) | Pin voice + style per character; avoid per-line timbre changes; A/B |
| Voices missing in a language | Disable the cast when the pool has fewer than 2 voices (Kokoro fr, MAI ja, Fish free) |
| Cost surprises | Show re-narration cost before a change; hash-keyed resume |
| Spoilers in the cast list | Show only characters at or before the cutoff chapter |
| Directions read aloud | Never put directions in Gemini `input`; probe the tag syntax |
| Free-tier data policy | Fish free has no DPA guarantees; tell the user |

## 6. Live A/B test (needs user approval + a fresh key, ~$1–2 limit)
- **Content:** a 12-min dialogue-heavy English chapter, a 3-min Chinese excerpt (“” quotes) and a 3-min Italian excerpt (em-dash dialogue). Hand-label ~300 quotes.
- **Arms:**
  - A: single voice
  - B: + delivery
  - B2: + packing
  - C: 2 voices + delivery
  - D: ElevenLabs v4 with tags
  - E: Kokoro single vs cast
- **Probes:**
  - a one-turn array with `instructions`
  - two voices in one request
  - the tag syntax
  - `speed` 1.2 on Gemini and Kokoro
  - Fish with no voice
  - MAI `instructions`
- **Cost:** ~$0.85 including retries. Per-call cost from `GET /api/v1/generation?id=…`.
- **Pass criteria:**
  - attribution ≥ 90% explicit, ≥ 75% overall on zh/it
  - delivery preferred in ≥ 60% of blind trials
  - no spoken directions
  - no timbre change within a character
  - p95 latency within budget

## Sources
- OpenRouter: https://openrouter.ai/openapi.json · https://openrouter.ai/api/v1/models?output_modalities=speech · https://openrouter.ai/docs/features/multimodal/tts
- Gemini speech: https://ai.google.dev/gemini-api/docs/speech-generation
- ElevenLabs prompting: https://elevenlabs.io/docs/best-practices/prompting
- Fish models: https://docs.fish.audio/developer-guide/models-pricing/models-overview
- Kokoro: https://huggingface.co/hexgrad/Kokoro-82M
- Quote attribution papers:
  - https://arxiv.org/abs/2406.11380
  - https://arxiv.org/abs/2204.05836
  - https://aclanthology.org/2024.lrec-main.1530
  - https://aclanthology.org/2024.sighan-1.1
  - https://aclanthology.org/2025.wnu-1.17
  - https://arxiv.org/abs/2608.02359
