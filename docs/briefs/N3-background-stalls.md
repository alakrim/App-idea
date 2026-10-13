# Brief N3: Chapters never get stuck when the user leaves the app

**Type**: implementation (services + pipeline + app lifecycle + one UI state). Read `CLAUDE.md`, `docs/CONVENTIONS.md` (React Compiler + Worklets rules), `docs/STATE.md` (N2 section), then `src/services/openrouter/{transport,client,speech,retry}.ts`, `src/core/pipeline/{queue,runner}.ts`, `src/core/async/ordered-pool.ts`, `src/core/pipeline/stages/narrate*.ts`, `src/services/pipeline/{runtime,facade,progress}.ts`, `src/features/pipeline/*`, `src/features/library/**` (the chapter row with the stage dots), and `src/features/diagnostics/recent-chapters*.ts(x)`.

## User report (2026-10-13)
"It is quicker now, but sometimes it gets stuck. The other day it got stuck on Narrating and never loaded. I have a feeling when I leave the app it doesn't load anymore."

## Architect's diagnosis (code-reading; confirm with tests)
- The pipeline runs in JS. When the app goes to the background, Android (Samsung, Android 15) **freezes the process within seconds**: no foreground service, and keep-awake only holds the screen while visible. JS timers stop and sockets idle.
- An HTTP request in flight at that moment is usually dead on return, because mobile NAT drops the connection. React Native's OkHttp has **no read timeout**, so only our JS timeout ends it. That timeout is up to 180 s for speech, counted again after resume. Each retry can then hit the same wall, and the split-and-join fallback adds two more 180 s waits.
- The result looks like "stuck forever" to the user, who sees no feedback.

## Scope
1. **Fail fast on return (transport).** Add a small "connection epoch" to the OpenRouter transport. It is driven by an injected app-state source, so core stays pure; the app wires React Native's `AppState`.
   - When the app goes `background`, record the moment.
   - On the next `active`, immediately abort every request that **started before** that background moment with a **retryable `NETWORK` failure tagged `stale`**.
   - Stale aborts **do not count** against `maxRetries`, and they retry at once, with no backoff.
   - User cancellation stays `CANCELLED`, as today. Make sure the two abort reasons can never be confused.
   - Apply the same to the `Fetcher` used for extraction, if it has the same exposure.
2. **Stall watchdog (queue/runtime).** Track the last pipeline activity (any progress, segment, stage or cost event, or a transport attempt start) per running chapter.
   - If the app is active and nothing has happened for **90 s plus the current request's timeout**, abort that attempt as stale (as in 1) and log a `stall` event to Diagnostics.
   - After **3 stalls** in one run, fail the chapter with a retryable error: "Lectio lost its connection while preparing this chapter. Tap Retry to continue where it stopped." Finished segments are kept (the resume logic already does this; prove it in a test).
3. **Honest UI while in progress.** The chapter row/card shows the current step with live detail: "Narrating · passage 5 of 18" (from progress events), plus elapsed time on the step once it passes 30 s.
   - After the app returns from the background with work in flight, show a quiet "Reconnecting…" line until the next progress event.
   - No spinner may show without text for more than 30 s.
4. **Tell the user what background does.** The first time a chapter is processing and the user leaves the app, raise a local notification if one is available without new native modules. Otherwise, on return, show a one-time toast: "Lectio pauses chapter preparation while it's in the background. Keep it open to finish faster." Wire it through a setting flag so it shows once. Do **not** add a foreground service (that is a separate proposal for the user).
5. **Diagnostics.** In "Recent chapters", add each stage's last-activity time, the stall count and the stale-abort count.

## Tests (mutation-check the key ones)
- A stale abort on resume retries immediately, does not consume a retry, and is not `CANCELLED`.
- A request started *after* the background moment is not aborted.
- The watchdog fires once per stall, fails the chapter after 3, and keeps saved segments.
- The progress copy reads "passage N of M".
- The toast shows once.

## Constraints
No real API calls; mock fetch and AppState. Do not run `npm install`. Do not add native modules. Do not commit. Don't touch `scripts/sounds/**`, `assets/**`, `src/core/analysis/**` or `src/audio/**` (other workers are there).

## Acceptance
`npm run verify` is green (paste the tail). Report the worst-case time from "user returns to the app" to "the request is retried", before and after.
