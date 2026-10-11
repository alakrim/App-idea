# R3: Content extraction (URL and PDF)

- **Brief**: `docs/briefs/R3-content-extraction.md`
- **Date**: 2026-10-11
- **Worker**: haiku-worker (research plus a throwaway Node spike in `/tmp/r3-spike`, not committed)
- **Scope note**: the spike ran in Node 22 (V8), not Hermes. Every Hermes-specific claim below is marked **unverified on device** unless a source says otherwise.

## TL;DR

1. **Use a layered pipeline.** Fetch bytes natively, decode the charset, then run **Readability + linkedom** in pure JS on device. Score the result. Only on a poor score, render the page in a **hidden WebView** and run Readability there. Use an **LLM index-selection pass** only for grey-zone results.
2. **Readability vs Defuddle.** Both work with linkedom in Node. On the news page, Defuddle gave cleaner metadata (author, date) and Readability left the byline and timestamp in the text. On the Japanese web-novel page, Readability dropped the nav text and Defuddle kept "目次 次へ" (contents / next). Neither was clean on the afterword. Run a 30-50 page bake-off before choosing. Do not use `@postlight/parser` (last published 2024-09).
3. **Quality gate.** Five measurable signals: effective length (CJK-aware), sentence-likeness, repeated-block ratio, boilerplate lexicon hits, link density on the candidate DOM. The thresholds below are proposals from a 3-page prototype and need calibration.
4. **LLM cost is small with the index approach.** The model returns only the indices of blocks to keep. For a 5,000-word chapter that is about $0.001 per call at OpenRouter list prices, versus about $0.004 for a full rewrite (output tokens cost 4-5x input).
5. **Encoding.** Use `arrayBuffer()` from fetch, never `text()`, which forces UTF-8. Sniff the charset from HTTP headers and `<meta>`. Decode non-UTF-8 pages with an engine that has the WHATWG legacy encodings. A WebView is the zero-dependency option. Pure-JS options are unverified for GBK, Big5 and Shift_JIS on Hermes.
6. **PDF.** The brief's premise is out of date. OpenRouter's `pdf-text` engine is **deprecated** and redirects to `cloudflare-ai`, which is free. Scanned PDFs go to `mistral-ocr` at $2 per 1,000 pages. On-device `pdfjs-dist` is plausible in a WebView, but **unverified on Hermes**.
7. **Sentence segmentation.** `Intl.Segmenter` is **not documented** for Hermes, so do not assume it. Ship a tested regex fallback for CJK and Latin text. Thai needs a separate plan.
8. **Legal blockers for the web-novel feature.** Syosetu's terms (Art. 14, item 23) prohibit automated data collection other than through its developer API. The "import next chapter" feature must therefore be user-triggered, one page at a time, and not an automatic crawl. BBC's robots.txt prohibits scraping and AI use of its content. Both need an architect decision (see Open issues).

---

## 1. HTML to main content in pure JS

### 1.1 Library versions (npm registry, checked 2026-10-11)

| Package | Latest | License | Last published | Notes |
|---|---|---|---|---|
| `@mozilla/readability` | 0.6.0 | Apache-2.0 | 2025-03-03 | Needs a DOM `Document`. Outputs title, content, textContent, excerpt, byline, dir, lang, publishedTime, siteName. |
| `linkedom` | 0.18.13 | ISC | 2026-07-07 | Pure-JS DOM. Used by the Defuddle README as a Node DOM. |
| `defuddle` | 0.19.5 | MIT | 2026-10-10 | Browser core has no dependencies. Node entry takes any DOM `Document` (linkedom, JSDOM, happy-dom). Returns author, published, site, wordCount, schemaOrgData and more. README says "very much a work in progress". |
| `@postlight/parser` | 2.2.3 | MIT | 2024-09-17 | Stale. Excluded. |
| `htmlparser2` | 12.0.0 | MIT | 2026-07-17 | Parser only, no DOM. Not evaluated further. |
| `happy-dom` | 20.14.6 | MIT | 2026-10-08 | Full DOM. Heavier than linkedom. Not evaluated further. |

Sources: npm registry (`npm view <pkg>`); [Readability README](https://github.com/mozilla/readability); [Defuddle README](https://github.com/kepano/defuddle); [Defuddle on npm](https://npmjs.com/package/defuddle).

### 1.2 Hermes compatibility

- Readability and linkedom are pure JavaScript with no Node built-ins. The likely Hermes risks are regex features (lookbehind, named groups) and DOM-like globals. **Unverified on device.** Probe:
  ```js
  const probe = { lookbehind: (() => { try { return new RegExp('(?<=a)b').test('ab'); } catch { return false; } })(),
                  hermes: !!global.HermesInternal };
  ```
- Hermes is the default engine in React Native and exposes `HermesInternal` for runtime detection ([React Native Hermes docs](https://reactnative.dev/docs/hermes)).

### 1.3 Spike results (Node 22, `@mozilla/readability` 0.6.0 + `linkedom` 0.18.13 + `defuddle` 0.19.5)

Pages (one fetch each, by hand, no crawling):
- `news.html`: BBC News article, https://www.bbc.com/news/articles/c3y0e871rk4vo (English).
- `novel-jp.html`: Syosetu (ncode.syosetu.com/n4830bu/1/), Japanese web-novel prologue.

| Metric | Readability | Defuddle |
|---|---|---|
| News: title | OK | OK |
| News: chars / words of content | 3,898 / 608 | 4,258 / 696 |
| News: leaked junk | Head starts "19 hours ago Aleks Phillips Purdue University" before the body | Head is clean; author and date moved to metadata |
| News: time (Node, includes warm-up) | parse 35 ms + Readability 51 ms | 288 ms |
| JP: chars | 1,498 | 1,491 |
| JP: leaked junk | None at head | Head starts "目次 次へ プロローグ" (contents / next). Nav text kept |
| JP: afterword | Excluded ("とうとう始めてしまいました…" dropped) | Included |
| JP: time (Node) | 14 ms | 98 ms |

Interpretation: n=2 is not enough to choose a library. The result shows each library fails differently, which supports the layered pipeline plus a quality gate.

Other observations:
- Readability's `commas` regex is `/,|،|﹐|︐|︑|⹁|⸴|⸲|，/g`. It counts the fullwidth comma (U+FF0C) but **not** the ideographic comma 、 (U+3001), which is common in Japanese and Chinese. Its comma-based scoring under-counts CJK text. Fix in a wrapper or patch.
- `charThreshold` (default 500) counts JS string characters, so it works for CJK without change. The default is 500 chars, roughly 250 Japanese words.

Sources: Readability source (`node_modules/@mozilla/readability/Readability.js`, grep of `commas`); [Readability README](https://github.com/mozilla/readability) (WebFetch); [Defuddle README](https://github.com/kepano/defuddle) (WebFetch).

### 1.4 Bundle size (esbuild, minified, platform neutral)

- Readability + linkedom (one entry module): **303,647 B minified, 107,740 B gzip** (about 304 KB / 108 KB).
- Defuddle core (`dist/index.js` bundled): **330,734 B minified, 96,580 B gzip** (about 331 KB / 97 KB).
- These are measured in Node with esbuild, not in the React Native bundler. Treat them as estimates.

### 1.5 Hidden WebView (react-native-webview)

- `injectedJavaScript` runs once, immediately after the first load. It does not re-run on navigation. `injectJavaScript(ref)` runs on demand. `window.ReactNativeWebView.postMessage` only accepts a string, and `onMessage` must be set or the bridge is not injected ([react-native-webview Guide](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Guide.md), WebFetch).
- The Guide does not cover hidden or zero-size WebViews or JS-disabled behaviour. **Unverified on device.** Hidden WebViews on Android need to remain laid out to run JS reliably. Test a 1x1 or `opacity: 0` view on a low-end Android device.
- Bridge message size limits are not documented. Measure: a 300 KB HTML string may be heavy. Prefer posting only the extracted result (about 10-30 KB).
- A WebView executes the page's own JavaScript, so it handles client-rendered pages and most cookie walls. It also runs third-party scripts, so the content should be treated as untrusted and the output sanitized.

---

## 2. Quality scoring

All thresholds are **proposals**. The prototype ran on 3 pages (news, Japanese novel, synthetic junk). Calibrate on a 30-50 page corpus before use.

### 2.1 Signals and formulas

Let `blocks` be the text blocks (p, li, h1-h3, blockquote) of the extracted content.

- **H1 Effective length.** `units = latinWords + 0.5 * cjkChars` (CJK ideographs, kana, Hangul, Thai; Latin words by whitespace split).
  - Fail if `units < 150` (article) or `units < 300` (chapter).
  - Good if `units >= 400`.
  - Prototype: news 595 Latin words; JP prologue 1,275 CJK chars = 637 units (passes); junk sample 90 words (fails).
- **H2 Sentence-likeness.** Among blocks with at least 20 units, the share ending in a terminal character (`. ! ? … 。 ！ ？ 」 ” ）`, after stripping trailing spaces).
  - Good `>= 0.80`. Grey `0.50-0.80`. Poor `< 0.50`.
  - Prototype: news 0.96; JP 0.90; junk 0.60. The junk sample scored 0.60 because its nav-like lines ("Share this on Facebook") were long enough to count and lacked punctuation.
- **H3 Repeated-block ratio.** Share of blocks whose exact text (digits normalized) appears 2+ times.
  - Above `0.10` is suspicious. Then remove short blocks (under 40 units) that appear 3+ times.
  - Prototype: news 0.07 (the byline "Aleks Phillips" repeated 3 times).
- **H4 Boilerplate lexicon.** Count blocks matching the lexicon in section 2.2. Any hit in a block under 60 units means remove it. Three or more hits in the document means poor.
  - The prototype did not catch "Share this on Facebook" or "Read more: Top 10 tips". This signal is required.
- **H5 Link density.** `linkChars / textChars` per candidate block on the **raw DOM**, not on Readability's output (Readability strips anchors, so measuring output gave 0 for all three samples; this is a limitation of my prototype, not a result).
  - Remove a block if `linkDensity >= 0.5` and it has under 200 chars. Container-level link density above `0.25` is poor.
  - **Not validated.** Measure on the raw DOM in the next spike.

### 2.2 Boilerplate lexicon (starting list, extend per language)

- **Cookie and consent**: `cookie`, `consent`, `accept all`, `Cookies`, `同意`, `Cookie`, `쿠키`.
- **Share and social**: `share this`, `share on`, `facebook`, `twitter`, `follow us`, `subscribe`, `分享`, `シェア`.
- **Related and comments**: `related`, `read more`, `more from`, `comments`, `相关阅读`, `コメント`, `関連`.
- **Web-novel navigation**: `next chapter`, `previous chapter`, `prev`, `下一章`, `上一章`, `次へ`, `前へ`, `次章`, `다음`, `이전`, `下一页`, `下一頁`.
- **Translator and donations**: `translator`, `TL note`, `A/N`, `author's note`, `翻译者`, `译者`, `作者的话`, `Patreon`, `Ko-fi`, `donate`, `PayPal`, `支持`, `ご支援`, `ご感想`.

### 2.3 Routing rule

- **Accept**: H1 good, H2 `>= 0.80`, H3 under 0.10, H4 zero hits.
- **Grey (LLM index pass)**: any of H2 in `0.50-0.80`, H4 hits 1-2, or H1 in the warning band.
- **Poor (hidden WebView, then re-score)**: H1 fail, H2 `< 0.50`, H4 hits 3+, or the page is empty after fetch (SPA shell).

---

## 3. LLM cleanup: index-selection prompt

### 3.1 Why indices

Asking the model to return only the indices of blocks to keep costs almost nothing in output. In the spike, a 30-block list of indices was 53 tokens (about 2 tokens per index). A full rewrite produces output about equal to the chapter length, and output tokens are priced 4-5x above input.

### 3.2 Token measurements (o200k_base as a proxy tokenizer, +/- 15% for other models)

| Input | Words or chars | Tokens |
|---|---|---|
| News body (Readability output, joined with newlines) | 608 words | 754 |
| Same, numbered `[i] ` prefixes | 30 blocks | 840 (+11%) |
| Index list output (27 indices) | 27 indices | 53 |
| JP prologue body | 1,276 CJK chars | 1,138 (about 0.78 tokens per char) |

Scale-up for a 5,000-word English chapter: about 6,500 body tokens, about 7,300 with numbering, plus about 350 for instructions, for about **7,600 input tokens**. Assume about 150 blocks, 135 kept: about **250 output tokens** (index list), or about **6,500 output tokens** (full rewrite).

### 3.3 Cost per chapter at OpenRouter list prices (fetched 2026-10-11 from `/api/v1/models`, $ per 1M tokens in / out)

| Model | Price (in / out) | Index pass | Full rewrite |
|---|---|---|---|
| `google/gemini-2.5-flash-lite` | 0.10 / 0.40 | about $0.0009 | about $0.0034 |
| `openai/gpt-4o-mini` | 0.15 / 0.60 | about $0.0013 | about $0.0050 |
| `anthropic/claude-haiku-5.5` | 0.10 / 0.50 (batch 0.05 / 0.25) | about $0.0009 | about $0.0040 |

Sources: [OpenRouter model list](https://openrouter.ai/api/v1/models) (fetched). No paid API calls were made for this report. These are arithmetic estimates, not measured outputs. Quality on CJK text is **unmeasured** and must be bake-off tested.

### 3.4 Draft prompt (system)

```
You clean text blocks extracted from a web page or PDF so they can be narrated.
You receive numbered blocks. Return ONLY a JSON array of the integer indices of
blocks that belong to the main narrative: the article body, the story prose, or a
heading that opens a section of it.

Drop a block when it is: navigation, a menu, an advertisement, a cookie or consent
notice, a share or follow button, a "previous/next chapter" link, a translator or
author note that asks for support or donations, a byline or timestamp repeated as
boilerplate, a related-links list, or a comments section.

Keep author or translator notes that are part of the story text.
When unsure, KEEP the block. Never rewrite or summarize text.
Output format: [0, 1, 2, 5, ...] in ascending order. No other text.
```

### 3.5 Draft prompt (user)

```
Title: {{title}}
Language hint: {{lang}}
Blocks:
[0] ...
[1] ...
```

### 3.6 Validation and guard rails

```ts
import { z } from 'zod';
const KeepIndices = z.array(z.number().int().nonnegative()).max(10_000);
// Parse, dedupe, sort, drop indices >= blocks.length.
// Reject the LLM result (fall back to the deterministic result) when:
//   kept blocks < 30% of input blocks, or
//   kept units < 50% of input units, or
//   the response does not parse after one retry.
```

Rationale: never let the LLM blank a chapter. The deterministic result is the fallback.

---

## 4. Encoding and CJK

### 4.1 What the sources say

- The WHATWG Encoding standard requires user agents to support the legacy encodings, including **GBK, GB18030, Big5, Shift_JIS, EUC-JP, EUC-KR, windows-874 and UTF-16LE** ([WHATWG Encoding standard](https://encoding.spec.whatwg.org/), section 4.2). Browser engines (Chromium in Android System WebView) meet this, so a WebView decodes these pages.
- In Expo SDK 51 (React Native 74), Hermes had `TextEncoder` but not `TextDecoder` ([`@bacons/text-decoder` page, via search](https://npmjs.com/package/@bacons/text-decoder)). That is third-party and may be outdated. `@bacons/text-decoder` (last published 2024-05) is UTF-8 only.
- `@borewit/text-codec` 0.2.2 (published 2026-03-11) says it targets Hermes and adds latin1, ascii and windows-1252 where the native `TextDecoder` is missing. Its GBK, Big5 and Shift_JIS coverage is **unverified** (README table not readable in search results).
- `iconv-lite` 0.7.3 (MIT, published 2026-07-17) covers all target encodings in pure JS, but it is written for Node `Buffer`. It would need a Buffer polyfill, and its bundle size on device is **unmeasured**.
- Hermes built-in `Intl` coverage is partial (see section 6). No source found for Hermes `TextDecoder` legacy encodings.

### 4.2 Recommended approach

1. Fetch with `fetch()` and read the body with **`arrayBuffer()`**. `text()` forces UTF-8 and corrupts GBK, Shift_JIS and Big5 pages.
2. Determine the charset in this order: BOM, then the `charset` in the `Content-Type` header, then `<meta charset>` or `<meta http-equiv="Content-Type">` found by an ASCII-safe scan of the first 2 KB.
3. If no label is found, decode as UTF-8. If more than 1% of the output is U+FFFD, retry with `gb18030`, `shift_jis` and `big5`. Choose the decoding with the fewest U+FFFD characters and the most common CJK characters.
4. Decode with:
   - **Option A (preferred, no new dependency):** pass the bytes to the hidden WebView as base64 and decode with the browser's `TextDecoder(label)`. Measure the bridge cost on a 300 KB page.
   - **Option B:** a pure-JS decoder (`iconv-lite` with a Buffer polyfill, or `@borewit/text-codec` if its coverage is confirmed). Spike on device.
5. Store the decoded text as UTF-8. Never store raw bytes.

### 4.3 Spike gap

I did not decode a GBK or Shift_JIS page. The Syosetu test page is UTF-8. A GBK test needs a sample page, which I did not fetch.

---

## 5. PDF text extraction

### 5.1 OpenRouter (cloud)

- **`pdf-text` is deprecated**. Requests are redirected to `cloudflare-ai` and still work ([OpenRouter PDF docs](https://openrouter.ai/docs/features/multimodal/pdfs), WebFetch).
- `cloudflare-ai`: converts PDFs to markdown with Workers AI, **free**. This is the free text path the brief wanted, under a new name.
- `mistral-ocr`: for scanned or image-heavy PDFs, **$2 per 1,000 pages** ($2.20 in the US data region). Used when the model lacks native file input. Default when no engine is set and the model has no native support.
- `native`: the file goes to a model with file input and is billed as input tokens.
- Page and file size limits are not documented.
- The request format is `plugins: [{ id: "file-parser", pdf: { engine: "cloudflare-ai" } }]` (example from the docs).
- Privacy: the PDF leaves the device. Needs explicit user consent (see Open issues).

### 5.2 On device

- `pdfjs-dist` 6.4.299 (Apache-2.0). Its `package.json` requires Node `>=22.13.0 || >=24`, which does not apply to Hermes. Running it in Hermes needs stubs for `DOMMatrix`, and likely `Path2D` and `ImageData`. A third-party project stubs `DOMMatrix` for text extraction ([n8n thread](https://community.n8n.io/t/dommatrix-is-not-defined-error-when-using-default-data-loader-with-pdf/299256), search result). **Unverified on Hermes.**
- **Recommended on-device route: pdf.js inside the hidden WebView.** pdf.js is built for browsers, so it needs no stubs there. Expected to work; **unverified on device**. It shares the WebView used for HTML.
- Native modules: Android `PdfRenderer` renders images only, so it cannot extract text. Not recommended.

### 5.3 Scanned PDFs (OCR)

- Detect scans: no text items from `getTextContent()` on most pages, or a low text-to-image ratio.
- Route scanned PDFs to `mistral-ocr` (user consent, cost shown: $2 per 1,000 pages, so a 300-page book is about $0.60).

### 5.4 Multi-column and header or footer removal

- Columns: cluster text items by x-coordinate (gap larger than about 15% of page width splits columns). Read left column top to bottom, then right.
- Headers and footers: normalize each line (strip digits and whitespace). A line that appears on at least 50% of pages within the top or bottom 8% of the page height is boilerplate.
- Page numbers: drop lines matching `^\s*(page\s*)?\d+(\s*/\s*\d+)?\s*$`, or a Roman numeral line.
- Hyphenation: when a line ends with `-` and the next starts with a lowercase letter, join them.
- **Heuristics are unvalidated.** Test on 5-10 real PDFs.

---

## 6. Sentence segmentation

### 6.1 Intl.Segmenter on Hermes

- Hermes's `Intl` docs list Collator, NumberFormat, DateTimeFormat, `getCanonicalLocales` and locale-aware string methods as supported, with partial property support. **`Intl.Segmenter`, `Intl.Locale`, `Intl.ListFormat`, `Intl.PluralRules` and `Intl.DisplayNames` are not listed** ([Hermes IntlAPIs.md](https://github.com/facebook/hermes/blob/main/doc/IntlAPIs.md), WebFetch).
- The Hermes `Features.md` says Intl is supported with the "Expanded Intl functionality" planned; `Segmenter` is not mentioned ([Hermes Features.md](https://github.com/facebook/hermes/blob/main/doc/Features.md)).
- The Hermes `lib/Platform/Intl` tree has `PlatformIntlICU.cpp`, `PlatformIntlApple.mm`, `PlatformIntlAndroid.cpp` and `BCP47Parser.cpp`. No visible reference to Segmenter in the listing (WebFetch).
- **Conclusion: `Intl.Segmenter` availability on Hermes is unverified.** Probe at runtime: `typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'`.

### 6.2 Fallback

- `@formatjs/intl-segmenter` 12.2.15 (npm, published 2026-09-12) polyfills the API. Its unpacked size is 1.18 MB, so its bundle size on device is a concern. **Unmeasured.**
- Tested regex fallback (Node 22):
  - CJK (`。！？!?…` plus closing quotes `」』”’）)`): `/[^。！？!?…]*[。！？!?…]+["”’」』）)]*|[^。！？!?…]+$/g`. Output for `本須は言った。「行くぞ！」そして歩き出した？` is `["本須は言った。", "「行くぞ！」", "そして歩き出した？"]`. Correct.
  - Latin: `/(?<=[.!?]["”’)]*)\s+(?=[A-Z"“])/`. Output for `He left. She stayed! Then it rained?  Yes.` is `["He left.", "She stayed!", "Then it rained?", "Yes."]`. Known gaps: abbreviations (`Mr.`, `e.g.`) and lowercase sentence starts.
  - Apply the CJK tokenizer to blocks containing CJK, and the Latin split to the rest.
- **Thai**: no sentence punctuation in most text. Spaces are inconsistent. A safe fallback is a length budget (for example 200-300 chars, split at spaces). Proper Thai sentence breaking needs a word-segmentation dictionary, which I did not evaluate.

### 6.3 Requirement for the rest of the app

Sentences are the unit for TTS chunks, highlight sync and ambience anchors. Store sentence offsets per block. If the fallback is used, mark it in the data so later re-segmentation with `Intl.Segmenter` does not break anchors.

---

## 7. Web-novel specifics

### 7.1 Patterns to extract

- **Chapter title**:
  1. The first `h1` or `h2` inside the content, if it matches the chapter pattern.
  2. `og:title` or `<title>`, with the site name removed (split on `|`, `–`, `—`, `·`, `»`, and ` - `).
  3. Chapter-pattern match: `第\s*\d+\s*章`, `第[一二三四五六七八九十百千0-9]+[章话話回]`, `Chapter\s+\d+`, `Ch\.?\s*\d+`, `\d+화`.
- **Previous and next chapter links**: `<link rel="prev">` and `<link rel="next">` in the head (most reliable); then anchors whose text matches the lexicon in section 2.2. Use them only for the user-triggered "import next chapter" action (see 7.2).
- **Translator notes**: often at the start or end of the chapter in a separate block. Use the lexicon in 2.2. Keep them out of narration by default, and show them as an optional note.

### 7.2 Legal and ToS notes (not legal advice)

- **Syosetu (ncode.syosetu.com)**, terms Art. 14, item 23: prohibits accessing the service or collecting data **by automated means other than the API provided through "なろうデベロッパー"** ([Syosetu terms](https://syosetu.com/site/rule/), WebFetch). Art. 14, item 20 prohibits placing undue load on servers. Art. 21, item 1 says rights in posted text belong to the author, including copyright.
  - **Consequence**: no automated "import next chapter" crawling for Syosetu. Only a user-triggered, single-page import, if the architect and legal approve it.
  - Syosetu `robots.txt` (fetched 2026-10-11): `User-agent: *` with `Crawl-delay: 1`. Honor the delay.
- **BBC**: `robots.txt` says "No scraping, crawling, or systematic extraction of content", and "No use of BBC content for training or fine-tuning AI models, including large language models (LLMs)", and "No retrieval-augmented generation (RAG), AI-powered search, agentic AI or grounding using BBC content" ([BBC robots.txt](https://www.bbc.com/robots.txt), fetched 2026-10-11).
  - **Consequence**: sending BBC article text to an LLM for cleanup may conflict with these terms. Needs legal review before we promise news support. The Readability-only path (no LLM) may be lower risk, still subject to the no-scraping term.
- **General**:
  - Honor `robots.txt` Disallow and crawl delays for any automated fetch.
  - Do not bypass bot challenges. My test requests to Royal Road and Reuters returned 403 and 401. Show the user "site blocked this request, paste the text or upload a PDF" instead.
  - Narrating or redistributing copyrighted novels is a copyright issue. Keep extracted text on device for personal use. Do not publish or share extracted text.
  - Donation and promotional notes are removed from narration, not from the user's copy.

### 7.3 Spike disclosure

I fetched one BBC article and one Syosetu chapter page by hand for the spike, with browser-like headers. This is a single test fetch, not crawling, but it is disclosed here because both sites' terms restrict automated access. No other pages were requested.

---

## 8. Recommended pipeline

1. **Input.** URL: fetch with `arrayBuffer()`, 10 s timeout, max 3 MB, follow redirects, respect `robots.txt` Disallow and crawl delay. PDF: read the file, then go to step 7.
2. **Charset.** Detect and decode as in section 4.2. Store UTF-8.
3. **Stage A, deterministic, on device.** Parse with linkedom, extract with Readability (or Defuddle, per bake-off). Build the block list. Compute H1-H5.
4. **Lexicon filter.** Remove blocks matching the section 2.2 lexicon when they are under 60 units. Remove repeated short blocks (H3).
5. **Routing.** Accept, grey, or poor per section 2.3.
6. **Stage B, poor only, hidden WebView.** Load the URL in a hidden WebView, wait for load plus a 1.5 s quiet period, run the same extraction (injected bundle), and post back only the result string. Re-score. Still poor: report "could not extract", offer paste or PDF.
7. **Stage C, grey only (or the user's "clean with AI" choice).** Send numbered blocks to the LLM index pass (section 3). Validate with zod and guard rails. On failure, keep the Stage A result.
8. **Metadata.** Title per section 7.1, author and date from Defuddle metadata if chosen, language from `lang` or charset detection.
9. **Sentences.** Segment per block (section 6). Store sentence offsets.
10. **PDF branch.** Text PDF: `cloudflare-ai` (free) or on-device pdf.js in WebView (after spike). Scanned PDF: `mistral-ocr` with consent and cost shown. Apply the header, footer and column heuristics (section 5.4). Then steps 4-9.
11. **Consent.** Before any content leaves the device (OpenRouter for LLM or PDF), show the user what is sent.

---

## 9. Open issues for the architect

1. **Hermes runtime probe on a device.** Not verified: `Intl.Segmenter`, `TextDecoder` legacy encodings, regex lookbehind, `pdfjs-dist` in WebView, hidden WebView JS execution on low-end Android, and bridge size limits. Suggested probe: a dev screen that logs the checks in section 1.2, 4.2 and 6.1.
2. **Legal decisions.**
   - Syosetu: confirm the "import next chapter" feature is user-triggered and single-page only. Or drop auto-next for that site.
   - BBC: LLM cleanup of BBC content may conflict with its no-AI and no-RAG terms. Decide whether news from BBC-type publishers goes to the LLM path. Consult counsel.
   - General copyright position for narrating novels for personal use.
3. **PDF consent.** Sending a PDF to OpenRouter's engines leaves the device. Confirm the consent flow.
4. **Engine choice.** The brief's premise (`pdf-text` free) is out of date. Use `cloudflare-ai`, and confirm its output quality on real PDFs.
5. **Readability's CJK comma gap.** Decide: wrapper or patch (add U+3001 and other CJK commas to the scoring regex).
6. **Library bake-off.** Readability vs Defuddle on 30-50 pages (news, blogs, web novels in ZH, JA and KO). Score each on junk-removal and missed-content rates.
7. **Corpus for thresholds.** Build the calibration set before fixing the section 2 thresholds.
8. **Missing repo files.** My standing instructions name `docs/CONVENTIONS.md` and `docs/STATE.md`. Neither exists in the repo, so I did not read them. The architect should confirm the expected paths.
9. **Repo state.** `git status` shows pre-existing untracked files (`.vscode/`, `AGENTS.md`, `assets/`, `package.json`, `package-lock.json`, `tsconfig.json`). I did not touch them. This report is the only repo file I created.

---

## 10. Sources

Primary (fetched directly):
- npm registry, `npm view` for each package listed in section 1.1 (2026-10-11).
- OpenRouter model list and pricing: https://openrouter.ai/api/v1/models
- OpenRouter PDF engines: https://openrouter.ai/docs/features/multimodal/pdfs
- Mozilla Readability README: https://github.com/mozilla/readability
- Defuddle README: https://github.com/kepano/defuddle
- Hermes Intl API doc: https://github.com/facebook/hermes/blob/main/doc/IntlAPIs.md
- Hermes features: https://github.com/facebook/hermes/blob/main/doc/Features.md
- Hermes Intl platform source tree: https://github.com/facebook/hermes/tree/main/lib/Platform/Intl
- React Native Hermes docs: https://reactnative.dev/docs/hermes
- react-native-webview guide: https://github.com/react-native-webview/react-native-webview/blob/master/docs/Guide.md
- WHATWG Encoding standard: https://encoding.spec.whatwg.org/
- Syosetu terms of use: https://syosetu.com/site/rule/
- Syosetu robots.txt: https://ncode.syosetu.com/robots.txt
- BBC robots.txt (terms notice): https://www.bbc.com/robots.txt
- Spike test pages: https://www.bbc.com/news/articles/c3y0e871rk4vo and https://ncode.syosetu.com/n4830bu/1/

Lower confidence (search snippets only, not read in full):
- Readability review (third-party, Aug 2026): https://thunderbit.com/blog/mozilla-readability-review
- `@bacons/text-decoder`: https://npmjs.com/package/@bacons/text-decoder
- `@borewit/text-codec`: https://classic.yarnpkg.com/en/package/@borewit/text-codec
- n8n DOMMatrix thread: https://community.n8n.io/t/dommatrix-is-not-defined-error-when-using-default-data-loader-with-pdf/299256

Not usable:
- Expo WebView SDK page (https://docs.expo.dev/versions/latest/sdk/webview/): no detail on injected JS or hidden views.
- `@postlight/parser`: not evaluated beyond npm metadata (stale).

## 11. Spike artifacts (not in repo)

`/tmp/r3-spike`: `spike.mjs` (Readability on pages), `defuddle-run.mjs`, `heur.mjs` (heuristic prototype), `tok.mjs` (token counts), `entry.mjs` and `bundle.min.js` (bundle size), `pages/` (2 downloaded pages: news.html, novel-jp.html). Nothing from the spike is committed.
