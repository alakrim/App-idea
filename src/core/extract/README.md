# src/core/extract

Purpose: turn an HTML page or a PDF's text into the article's main blocks, then decide whether that result is good enough to narrate.

**Layout**
- `pipeline.ts`: `extractArticle()`, `extractFromHtml()`. `extractors.ts`: Readability and Defuddle. `blocks.ts`, `dom.ts`, `charset.ts`: HTML to blocks, DOM parsing, decoding.
- `lexicon.ts`, `postfilter.ts`, `text-metrics.ts`: boilerplate rules (nav, ads, share, cookie notices, bylines) and text measures.
- `quality.ts`: `scoreExtraction()`, `decisionForScore()`. Thresholds: `ACCEPT` 0.8, `WEBVIEW_BELOW` 0.55.
- `select.ts`, `prompts.ts`: the model's block picks (schema, prompt, parse, apply).

**Entry points:** `pipeline.ts` `extractArticle()`; `quality.ts` `decisionForScore()`; `select.ts` `applySelection()`.

**Gotchas:** the model returns indices to keep, never text, so it cannot add content. A selection that drops more than 70% of the characters is refused. Decisions are `accept`, `llm_select` or `webview` (ADR 0004).

**Tests:** `*.test.ts` beside each file, run with `npm run test:core`. Real pages (news, blog, CJK novels, SPA shell) are in `__fixtures__/`.
