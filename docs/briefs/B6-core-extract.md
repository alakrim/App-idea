# Brief B6: Content extraction engine (pure core)

**Type**: implementation in `src/core/extract/`. Read `CLAUDE.md`, `docs/CONVENTIONS.md`, **`docs/decisions/0004-extraction-pipeline.md`** (authoritative) and **`docs/research/R3-content-extraction.md`**.

## Goal
Given raw bytes plus headers from a URL fetch, produce clean narrative text with a quality score, using no network and no DOM other than `linkedom`. The WebView fallback and the LLM call are wired by a later brief. Here you expose the pure pieces they need.

## Scope
1. `charset.ts`: `detectCharset(bytes: Uint8Array, contentType?: string) → string` (BOM, header, `<meta charset>` / `http-equiv` in the first 4 KB, then UTF-8 validity check) and `decode(bytes, charset, decoders?)`, which uses `TextDecoder` when it supports the label and otherwise an injectable fallback decoder map. Do not bundle large CJK tables now; define the interface and leave a clear error code `UNSUPPORTED_ENCODING` for the pipeline to fall back to the WebView.
2. `extractors.ts`: `extractWithReadability(html, url)` and `extractWithDefuddle(html, url)`, both using `linkedom`'s `parseHTML`. Each returns `{ title, byline, lang, siteName, publishedAt, contentHtml, text, blocks: Block[] }` where `Block = { tag: 'p'|'h'|'li'|'blockquote'|'pre', text }`. Convert the content HTML into blocks with **paragraph structure preserved** (CJK novel pages often use `<br><br>` instead of `<p>`, so handle that).
3. `quality.ts`: `scoreExtraction({ blocks, rawHtml, lang }) → { score: 0..1, signals: {...} }`, implementing the signals and thresholds proposed in R3 (sentence-likeness, repeated-boilerplate ratio, raw-DOM link density computed on the source page's main candidate, CJK-aware length, a nav-phrase lexicon hit-rate). Export the thresholds `ACCEPT = 0.80` and `WEBVIEW_BELOW = 0.55` as constants.
4. `postfilter.ts`: deterministic cleanup of blocks. Remove duplicated title lines, byline/timestamp lines, nav lines (lexicon in EN, ZH, JA, KO, PT, IT, ES, FR, DE: "Next chapter", 下一章, 次へ, 다음 화, Próximo capítulo, Capitolo successivo, …), donation/translator notes ("Support me on Patreon", "TL note", 求月票, …), share/comment prompts and cookie notices. Every rule lives in a data table with a test.
5. `select.ts`: the **LLM index-selection** contract (pure parts only).
   - `buildSelectionPrompt(blocks) → { system, user }`: numbered blocks, each truncated to 300 chars for the prompt (the full text is kept locally), asking for `{ keep: number[] }`.
   - `selectionSchema` (zod).
   - `applySelection(blocks, keep)`, which tolerates out-of-range indices and refuses a selection that drops more than 70% of the characters (returns the original + a warning).
   - Prompt version constant.
6. `pipeline.ts`: `extractArticle({ bytes, contentType, url }) → ExtractResult`
   - Decode, run both extractors, post-filter, score, and pick the best.
   - Return `{ decision: 'accept'|'llm_select'|'webview', best, alternatives, score, signals }`.
   - Also export `extractFromHtml(html, url)` for the WebView path.
7. Fixtures (`__fixtures__/`): write **realistic synthetic** HTML pages yourself (do not download copyrighted pages):
   - a news article with nav, ads, related links and comments
   - a blog post with a cookie banner
   - a Chinese web-novel chapter page (GBK-declared meta, but store the fixture as UTF-8 and test the detector separately with byte arrays), with `<br>` paragraphs, 上一章/下一章 links and a 求月票 note
   - a Japanese novel page with 目次 / 次へ
   - a junk page (mostly links), which must route to `webview` or `llm_select`
   - an empty SPA shell (`<div id="root"></div>`), which must route to `webview`
8. Tests: per module, plus end-to-end `extractArticle` on each fixture asserting the decision and that key narrative sentences survive while junk lines do not.

## Constraints
- Dependencies are already installed (`linkedom`, `@mozilla/readability`, `defuddle`). Do not run `npm install`. If `defuddle` cannot run under linkedom without the DOM APIs it expects, document it, keep Readability-only, and report.
- `src/core` must not import RN or Expo. Only touch `src/core/extract/**`.

## Acceptance
`npm run typecheck`, `npm run lint` and `npm run test:core` pass (paste the tails). Report the decision and score for each fixture in a table.
