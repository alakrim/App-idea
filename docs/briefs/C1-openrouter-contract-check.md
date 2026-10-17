# Brief C1: OpenRouter contract check (catch "works in tests, fails on the phone")

**Type**: tooling + audit (no app behaviour changes unless a check finds a real bug).

**Read first**: `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/STATE.md` ("Incident 4"), `src/services/openrouter/*.ts` (`chat`, `speech`, `models`, `key`, `pdf`, `transport`), `src/services/pipeline/adapters/*.ts`, `src/core/defaults.ts`, `src/core/narration/{options,capabilities,formats}.ts` and `src/core/analysis/limits.ts`.

## Why
Two device failures came from API contract mismatches that unit tests could not see, because the tests mock OpenRouter:
- **Gemini TTS is PCM-only** (2026-10-11).
- **Incident 4** (2026-10-17): `temperature` and `seed` were sent with `require_parameters`, and no `claude-haiku-5.5` endpoint accepts them. Every chapter failed.

OpenRouter publishes what each endpoint accepts at public, **free, keyless** URLs:
- `GET https://openrouter.ai/api/v1/models?output_modalities=text|speech`
- `GET https://openrouter.ai/api/v1/models/<id>/endpoints`, which lists `supported_parameters` per provider endpoint

A check against these catches this class of bug before an APK ships.

## Scope
1. **Request inventory** (`scripts/contract/inventory.md`, generated or hand-written with code references): every OpenRouter call the app makes, with its exact body fields and when each is sent. Cover:
   - `chatRaw`/`chatJson`/`chatText`, with `response_format`, `provider.require_parameters`, `cache_control`, `max_tokens`, `temperature`, `seed`, and plugins for PDF
   - `/audio/speech`, with `voice`, `response_format`, `speed`, `instructions`, and the format fallback
   - `/models`, `/key`, generation lookups
2. **`npm run contract:check`** (`scripts/contract/check.mjs`, Node 22 built-in `fetch`, no new dependencies, no key):
   - For each **default and curated model**, fetch `/endpoints`:
     - text: `DEFAULT_MODELS` (translation, analysis, cleanup)
     - speech: the 3 narrator options plus the 5 newest speech models
   - Then assert:
     - **structured-output calls**: at least one endpoint supports `structured_outputs` (or `response_format`) **and** every other parameter the app sends with `require_parameters` (derive the parameter list from the same code constants, not a copy)
     - **speech**: the model is listed with `speech` output; the voice the app would pick is in `supported_voices` (or the model has none and the app omits voice); `instructions` is sent only where `capabilities.supportsStyleInstructions` says so; `speed` handling is consistent with the docs (some providers 400 on non-default speed: check what we send)
     - **pricing** present and parseable for every default, because the cost estimates depend on it
   - Print a readable table: model, call type, OK/FAIL, and the reason.
   - Exit non-zero on FAIL. Add `--json` for machine output.
   - Network failures give exit code 2 with a clear "could not reach OpenRouter" message, distinct from FAIL.
3. **Wire it**:
   - Add `contract:check` to `package.json`. **Not** in `verify` (verify must stay offline).
   - Add it to the APK build script as a pre-flight step that warns loudly. It should fail the build only with `--strict`.
   - Document it in `docs/BUILD-ANDROID.md`.
4. **Run it now** against the live API and report every FAIL with a root cause. For each FAIL that is a real app bug:
   - Propose the minimal fix in your report.
   - **Don't change app code**: another worker is merging the code lines, and app-code edits would conflict.
   - Exception: the script itself and `scripts/**`.
5. **Unit tests** for the check's pure logic: given fixture `/endpoints` JSON, it must decide OK/FAIL correctly. Include the incident-4 case: haiku endpoints without `seed`, plus a request with `seed` and `require_parameters`, must FAIL. Use `node --test` like `scripts/sounds/*.test.mjs`, and add the tests to an existing node test script.

## Constraints
- Public endpoints only, no API key, no paid calls. Be polite: run requests sequentially with about 200 ms between them, and send a descriptive User-Agent.
- Only touch `scripts/contract/**`, `package.json` (scripts only), `scripts/android/build-apk.sh`, `docs/BUILD-ANDROID.md`, and a short "C1" line in `docs/STATE.md`.
- Work in your worktree. If `node_modules` is missing, run `ln -s /home/user/App-idea/node_modules node_modules`. Commit with your harness Co-Authored-By trailer plus `Claude-Session: https://claude.ai/code/session_016sqBEw3paK5QXmP6QkprQ9`. Do not push.
- Context budget: at about 220k tokens, stop at a committed checkpoint and write `docs/briefs/C1-handoff.md`.
