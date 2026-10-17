# C1 handoff: OpenRouter contract check

**Status at checkpoint:** code, tests, wiring and inventory are committed on branch `worktree-agent-adb5d14e474db71c2` (not pushed). The live check was run and returned 31 OK, 0 FAIL. The worker stopped at the context budget before the last verification steps.

## Done and verified
- `scripts/contract/*`: `check.mjs` (CLI, table, `--json`, exit codes 0/1/2/3), `openrouter-live.mjs` (sequential public GETs, 200 ms gap, descriptive User-Agent, no key), `rules.mjs` (pure verdicts), `scenarios.mjs` (captures the app's real request bodies through its own client, LLM port, analysis engine, TTS adapter and narration rules, with a recording fetch that refuses everything else), `ts-loader.mjs` (loads the app's `.ts` modules via `module.registerHooks` and the repo's `typescript`, nothing written to disk), `inventory.md`, two fixture files.
- Tests: `rules.test.mjs` and `openrouter-live.test.mjs`, wired into `sounds:test` (34 contract tests, 49 total in that script, all pass). Incident-4 case: haiku fixture plus `seed` with `require_parameters` gives FAIL.
- `npm run contract:check` in `package.json`. Not in `verify`.
- `scripts/android/build-apk.sh`: step 0 pre-flight, warns on FAIL or exit 2, `--strict` stops the build.
- `docs/BUILD-ANDROID.md` section, `docs/STATE.md` C1 line.
- `npm run typecheck`, `npm run lint` (full repo) and `npx prettier --check` pass.

## Remaining (small, in order)
1. **Exit-2 path, live proof.** The reader's unreachable mapping is unit-tested, but the CLI's exit 2 was not exercised. Run it with a preload that replaces `globalThis.fetch` with a function that throws `TypeError('fetch failed')`, for example `node --require /tmp/.../preload.cjs scripts/contract/check.mjs`, and expect exit 2 and the "could not reach OpenRouter" line. Keep the preload in the scratchpad, not the repo.
2. **Bite proof on live data (optional, quick).** Show that a body with `seed` fails against the live haiku endpoints. The fixture is a trimmed copy of the same live data, so this is a formality.
3. **Build script smoke.** `bash -n scripts/android/build-apk.sh` passed. Running the step needs the Android SDK, so it was not run. Do not run the full APK build for this.
4. Re-run `npm run sounds:test`, `npm run lint`, `npm run typecheck`, then update the commit only if something changes.

## Findings for the architect (no FAIL)
- The live run found no contract violation today. The analysis, translate and cleanup bodies send only `response_format` with `require_parameters`, and the vocab body sends `response_format` and `max_tokens`. Every structured call has at least one endpoint that accepts all of its parameters.
- Speech endpoints publish no `supported_parameters` (all `[]`), so `response_format` acceptance and `speed` acceptance per provider cannot be checked from public data. The app sends `speed: 1` on every call. This is a risk, not a FAIL.
- `scripts/contract/scenarios.mjs` rebuilds the cleanup schema from `selectionSchema`, because `web-extract.ts` imports `defuddle/node`, which cannot load in Node's CommonJS hook. A source assertion stops the check with exit 3 if the app changes that line. If the extraction stack becomes loadable, replace it with a direct import.
- The vocab call reads `EXPLAIN_TEMPERATURE` and `EXPLAIN_MAX_TOKENS` from source, because they are not exported. Proposed app fix (not made, brief scope): export them from `src/core/vocab/prompts.ts`.

## Decisions to review
- The contract tests were added to the existing `sounds:test` script (the brief says to add them to an existing node test script). The name is misleading, so consider renaming it to `node:test`.
- Exit code 3 is for check errors. The brief named only 0/1/2.
- `--strict` fails the build on both FAIL and exit 2.
