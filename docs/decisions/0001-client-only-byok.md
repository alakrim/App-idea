# ADR-0001: Client-only, bring-your-own-key architecture

**Status**: accepted (2026-10-11)

## Context
The user supplies their own OpenRouter API key. The product turns their own content into audio for personal listening.

## Decision
There is no backend. The app calls OpenRouter (and any optional TTS provider) directly from the device. All data is stored locally.

## Consequences
- Zero server cost and no account system, which also means no PII on our side.
- The key lives on the device in the OS keystore. A compromised device could leak it, which is acceptable for BYOK and is documented in Settings.
- There is no cross-device sync. A later option is an export/import file or the user's own cloud drive.
- Long jobs must run on the device, so they need resumable pipelines and foreground-service notifications on Android.
- Model price data comes live from OpenRouter `/models`, so cost previews stay current without app updates.
