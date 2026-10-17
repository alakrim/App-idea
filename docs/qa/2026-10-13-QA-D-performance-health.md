# QA-D: Performance, size, startup, code health (2026-10-13)

_Read-only audit by a haiku-worker (brief Q1), pinned at 5d78458. Timings are from a desktop (Node, V8, better-sqlite3) and are relative only. The architect spot-verified P1-1: `openrouter-provider.tsx` writes the catalogue snapshot after every `models.list`, including cache hits. No P0 was found. At the pinned commit, typecheck, lint, jest (191 suites, 1,839 tests) and the Android export are all green._

## P1
1. **Add Chapter (text mode) rewrites the 218 KB catalogue snapshot 6–8× per keystroke.** The causes:
   - the snapshot is written on every `list`
   - `catalog.find` does 2 `list` calls
   - each estimate does 3–4 `find` calls
   - the estimate isn't debounced
   - `Array.from` runs on every render

   Fix: write the snapshot only after a network fetch, debounce the estimate by 300 ms, and memoise the character count. S.
2. **Web extraction parses the DOM about 6× per page on the JS thread.** On desktop, a 3 MB page takes ~2.5–3 s of DOM work, and the UI freezes. Fix: parse once, compute link density once, and build blocks from the nodes. M.
3. **PDF import has no size cap**, and the transient heap use is ~2.7× the file size (same as QA-A P0-1). Fix: cap the size at pick time. S.

## P2
1. **The model catalogue has no in-flight de-duplication.** With a cold cache, concurrent 772 KB downloads happen (analysis concurrency 3). S.
2. **The series screen does an N+1 ledger GROUP BY and loads every segment row to count them.** Fix: `WHERE chapter_id = ?` and `COUNT(*)`. S.
3. **The trigram FTS over `text` and `translated` doubles DB size and insert time** (41 MB vs 20 MB for 60k sentences). Fix: trigram only for CJK and/or only `text`, via a new migration. M.
4. **`setTranslations` does one UPDATE per sentence**, each firing the FTS triggers. Fix: chunked upsert. S.
5. **The extraction stack (~0.9 MB of JS, ~22 %) loads at boot** via `bootstrap.ts`. Fix: require it lazily in the extract port. S.
6. **`defuddle/node` pulls in temml, mathml-to-latex and turndown.** The browser build gives byte-identical output on all 6 fixtures and saves ~0.2–0.3 MB. S.
7. **Settings walks every library file synchronously on mount.** Fix: async, or keep a running total. S-M.
8. **Long lists aren't virtualised**: series chapters and vocab use `map` inside a ScrollView. S-M.
9. **All beds ship in the APK.** At 64 kbps, A4 would make the APK ~76 MB. **Architect decision (2026-10-13): A4 beds are encoded at 48 kbps AAC mono, with a 24 MB budget.** On-demand packs are a bigger jump.
10. **71 npm advisories** (62 in prod, mostly by version range or build time). Runtime-relevant: `decode-uri-component` via expo-router → query-string. **Never run `npm audit fix --force`.** Triage the advisories and decide on Expo 58. M.
11. **No CI**: no `.github`, no `eas.json`, no pre-commit hook. Fix: a GitHub Actions workflow that runs `npm ci` and `npm run verify`. S.
12. **Test gaps:**
    - `series-data.ts` (Play and Continue targets)
    - `usage-ledger.ts`, `llm-port.ts`
    - `ask-data.ts`
    - `use-saved-key`, `use-key-connection`
    - `job-records.ts`
    - `web-extract.ts`, covered only indirectly

## P3
- Dead exports: `useChapter`, `playerCoverMaxWidth`, `VOCAB_PROMPT_VERSION`, `VocabExplanationReply`, `Timestamp`.
- Two unused test bindings.
- Dev screens and fixtures are bundled in release.
- The catalogue is hydrated on the first render path.
- Re-render scope: the mini player at 4 Hz, the progress map, whole-settings subscriptions.
- ~1 MB Material Symbols font via expo-router.
- `useLegacyPackaging`: revisit for the AAB.

## Bigger jumps
1. Move DOM extraction off the JS thread, into the hidden WebView or a worklet runtime. This removes ~0.9 MB of JS and the biggest stall. Spike on a device first. M-L.
2. On-demand sound packs: −20–30 MB of APK. Needs hosting, which is external spend, so it needs the user's approval. L.
3. R8 / resource shrinking: currently off by user decision. M.
4. A Play AAB with arm64 split. S-M.
5. Expo 58 upgrade, for the advisories. L.
6. Slim down zod (~312 KB). L.
7. **Device measurement spike (S1)** before tuning: Hermes profiles of cold start, typing, a 3 MB page, and a 100-chapter series. Recommended.
