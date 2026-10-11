# src/services

Adapters to the outside world: the OpenRouter client, TTS providers, file system and database access.

**Import rules**

- May import from `src/core`, and from other `src/services` modules.
- All LLM calls go through `services/openrouter` so cost and token accounting stay centralized.
- Tests mock the network. Nothing here may call a paid API from a test.
