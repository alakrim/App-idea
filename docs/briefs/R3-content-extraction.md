# Brief R3: Content extraction (URL and PDF) research

**Type**: research, plus a tiny throwaway spike allowed in the scratch directory `/tmp/r3-spike` (NOT in the repo). Today is 2026-10-11.

## Context
In Lectio, the user pastes a URL (news article, blog, **web-novel chapter** on sites full of ads, often Chinese/Japanese/Korean novels) or picks a PDF. We must keep **only the narrative content**: no ads, nav, comments, "next chapter" buttons, translator notes asking for donations, cookie banners or share widgets. It must run **on the phone** (React Native/Expo, Hermes JS engine, no Node APIs, no browser DOM) and be **cost-efficient**: deterministic extraction first, with an LLM only when needed.

## Questions
1. **HTML → main content in pure JS without a browser DOM.** Evaluate:
   - `@mozilla/readability` + `linkedom` (or `happy-dom`/`htmlparser2`-based DOM): does it run on Hermes? Bundle size?
   - `defuddle` (by kepano), `@postlight/parser`, `article-extractor`, and others current in 2026.
   - Running Readability *inside a hidden WebView* (react-native-webview `injectedJavaScript`). This also handles JS-rendered pages and cookie walls.
   - Recommend a layered strategy, e.g. (1) fetch + Readability-in-JS, (2) if the result is poor, a hidden WebView render + Readability, (3) LLM cleanup.
2. **Quality scoring.** Cheap heuristics to decide whether extraction is good enough or needs the LLM pass: text density, link density, repeated boilerplate lines, a sentence-likeness ratio, and CJK-aware length. Propose concrete formulas and thresholds.
3. **LLM cleanup prompt design.** The most token-efficient way to have an LLM remove residual junk: e.g. send numbered paragraphs and ask it to return **only the indices to keep** (output tokens ≈ tiny) instead of rewriting the text. Estimate the token cost for a 5,000-word chapter with a cheap model.
4. **Encoding and CJK.** Charset detection (GBK/GB18030/Big5/Shift_JIS pages are common on novel sites): how to decode in React Native (`TextDecoder` support in Hermes? `iconv-lite` alternatives?).
5. **PDF text extraction on device.** Options: `pdfjs-dist` in Hermes (feasible?), inside a WebView, native modules (`react-native-pdf-light`? Android PdfRenderer is image-only), vs sending the PDF to OpenRouter's file-parser (`pdf-text` engine free?). Handling scanned PDFs (OCR) and multi-column layouts. Headers, footers and page-number removal heuristics.
6. **Sentence segmentation** for many languages, including CJK and Thai: `Intl.Segmenter` availability in Hermes (2026), or fallbacks. This matters because sentences are our unit for TTS chunks, highlight sync and ambience cue anchors.
7. **Web-novel specifics.** Common patterns on popular sites (e.g. chapter title extraction, the "previous/next chapter" link for an "import next chapter" feature) and legal/ToS notes to show the user.

## Spike (optional, recommended)
In `/tmp/r3-spike`, run a quick Node test of `@mozilla/readability` + `linkedom` on 2–3 real pages (one news article, one web-novel chapter page) and report the output quality and timing. Do not commit anything from the spike.

## Deliverable
Write `docs/research/R3-content-extraction.md` with a TL;DR, the recommended pipeline as numbered steps, the heuristics with thresholds, prompt drafts, library versions and sources. Do not modify any other repo file.
