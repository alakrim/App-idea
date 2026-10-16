# STATE: source of truth

_Last updated: 2026-10-16 by architect. Keep this file under ~500 words. History lives in `docs/archive/STATE-history.md` (do not read by default)._

## Current phase
Core loop is complete in code (URL/PDF/text → extract → clean → analyze → translate → narrate → play, plus ambience, memory Q&A, vocab). `npm run verify` green at last run (182 suites, 1,738 tests). Now: device testing and M8 polish.

## Milestones
| # | Scope | Status |
|---|---|---|
| M0–M7 | Protocol, research, scaffold, domain/DB, text, OpenRouter, extraction, analysis, settings, library, pipeline, translate, narrate, player, ask, vocab | ✅ done and verified |
| M8 | Polish, accessibility, performance, EAS build, device spike S1, Maestro E2E | not started |

## Work in flight
None. Waiting on the user's device test of the latest APK `lectio-0.1.0-63a0b8c-arm64.apk` (branch `apk-builds`). The user asked for bug fixes only until they have tested properly.

## Blockers
- **A3 (real ambience from Freesound)** is blocked: `freesound.org` and `cdn.freesound.org` return 403 at the proxy. The user must allow them in the environment network settings, then start a new session. Brief ready: `docs/briefs/A3-freesound-ambience.md`. CC0 sounds only, one ledger entry per file.
- **Live API key**: the user may add `OPENROUTER_API_KEY` (credit limit $1) or `FREESOUND_API_KEY` as environment secrets. Read only from env, never write to repo, files or logs. After a test, remind the user to revoke the key.

## Next up
1. Process the user's device-test feedback (bug fixes first).
2. **S1 device spike**: lock-screen next/prev/seek (not exposed by expo-audio 57), segment-swap gap, pitch at 2×, audio session ownership (expo-audio vs audio-api), interruptions, ducking latency < 100 ms, 45 min background ambience.
3. **E1**: native Android AAC encoder module (MediaCodec + MediaMuxer, WAV → m4a). PCM models currently store WAV (~170 MB/h).
4. M8 polish (see backlog).

## Open backlog
- Ask citations should carry a sentence index so chips can deep-link.
- Orphaned `<idx>.mp3` stays on disk when a chapter switches to WAV; move `.wav` preview handling into `preview-cache.ts`.
- `boot:check` stalls before the first route renders, so it cannot prove later startup paths.
- Unverified without a live call: Fish free (no-voice request, output format, daily-limit wording), Kokoro voice quality per language.
- M8: windowed click detector for the sound pack gate; lazy-require the extraction stack (+2 MB Hermes bytecode); triage `npm audit` (65 transitive); R8/resource shrinking revisit for Play builds.

## Decisions
ADRs in `docs/decisions/` (0001–0006). One-liners: client-only BYOK; Expo SDK 57 with hybrid audio behind `AudioEngine`; narration via OpenRouter `/audio/speech` with Gemini Flash Lite TTS as default (three narrator tiers); layered extraction; ambience beds only (max 2, −22 dB, CC0-first); LLM output contracts (`.nullable()`, never `.optional()`).

## Handoff (overwrite at the end of each session)
- **Last session:** 2026-10-16, restructured docs to cut startup tokens (slim STATE, routing in CLAUDE.md, per-area architecture, folder maps). No product code changed.
- **Next session starts with:** read this file, then the one brief you are given. Nothing else by default.
- **Key files:** `docs/CONVENTIONS.md`, `docs/ARCHITECTURE.md` (open only the section you need).
