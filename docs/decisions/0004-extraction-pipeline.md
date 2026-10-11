# ADR-0004: Layered, mostly-free content extraction

**Status**: accepted (2026-10-11). Evidence: `docs/research/R3-content-extraction.md`.

## Decision
1. **Fetch** with `fetch` → `arrayBuffer`. Detect the charset from the BOM, then the `Content-Type` header, then `<meta charset>`, then a sniff. Decode with `TextDecoder`. For legacy CJK encodings (GBK/GB18030/Big5/Shift_JIS/EUC-KR), fall back to a pure-JS decoder table if Hermes lacks them (device probe P1).
2. **Extract on device** with **both** Defuddle and `@mozilla/readability` over `linkedom`. Score each result and keep the better one. They fail differently, and both are cheap (~50 ms). The cost is about 200 KB of gzip bundle, which is acceptable.
3. **Quality gate** (`src/core/extract/quality.ts`), scoring 0..1 from these signals: sentence-likeness ratio, repeated-boilerplate ratio, raw-DOM link density, CJK-aware length, and a nav-phrase lexicon (目次, 次へ, 下一章, Next Chapter, Share, Comments…).
   - ≥ 0.80: accept as is
   - 0.55–0.80: **LLM index selection**
   - < 0.55: **hidden WebView render** + re-extract (JS-rendered pages, cookie walls), then gate again
4. **LLM index selection**: send numbered blocks and get back `{keep: number[]}`. This costs about $0.001 per 5k-word chapter with a cheap model. The model never rewrites the text, so no hallucinated content can enter the book.
5. **Deterministic post-filters**: strip the title duplicated in the body, byline and timestamp lines, translator/donation notes (a lexicon), and trailing "next/previous chapter" lines.
6. **PDF**: extract on device with pdf.js inside a hidden WebView (device probe P2), plus a header/footer/page-number remover (lines repeated across pages, numeric-only lines). Fallbacks go through OpenRouter's file-parser: `cloudflare-ai` (free), and `mistral-ocr` only after a cost confirmation for scanned PDFs (detected by < 50 chars/page).
7. **Segmentation**: use `Intl.Segmenter` when it is available (device probe P1). Otherwise use our rule-based splitter, which is CJK-aware (。！？ plus closing quotes 」』"), handles abbreviations for Latin scripts, and has been tested on fixtures.

## Legal/UX
- Import is always **user-initiated, one page at a time**. "Next chapter" is a button the user taps, never a crawler.
- A one-time onboarding notice explains that content is sent to the AI models the user picks, using their key. Users import content they have rights to read; the ToS link is shown.

## Device probes (bundle into one dev-build screen, run with S1)
- P1: `Intl.Segmenter`, `TextDecoder('gbk'|'big5'|'shift_jis')`, regex lookbehind
- P2: pdf.js in WebView on a 200-page PDF, and the bridge message size limit

## Amendment (2026-10-11): PDF path for v1
For v1 the **default PDF path is OpenRouter's file-parser `cloudflare-ai` engine** (free). On-device pdf.js is deferred to M8. Reasons: the text goes to OpenRouter for analysis anyway, a WebView pdf.js bundle would add about 1 MB plus bridge complexity, and the free engine handles multi-column layouts better than a quick pdf.js port. Scanned PDFs (< 50 chars/page) prompt for `mistral-ocr` with a cost confirmation.
