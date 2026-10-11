/** Structural tag of one extracted block. `p` covers plain prose and any unlisted container. */
export type BlockTag = 'p' | 'h' | 'li' | 'blockquote' | 'pre';

export interface Block {
  tag: BlockTag;
  text: string;
}

/** Raw output of one extractor, before post-filtering and scoring. */
export interface ExtractedArticle {
  title: string | null;
  byline: string | null;
  lang: string | null;
  siteName: string | null;
  publishedAt: string | null;
  contentHtml: string;
  text: string;
  blocks: Block[];
}

export type ExtractorName = 'readability' | 'defuddle';

export interface RemovedBlock {
  /** Index in the extractor's block list, before filtering. */
  index: number;
  text: string;
  /** Rule id from the lexicon table, or `duplicate_title`, `byline`, `repeated_short_block`. */
  reason: string;
}

export interface QualityComponents {
  length: number;
  sentence: number;
  repeated: number;
  lexicon: number;
  links: number;
}

export interface QualitySignals {
  /** Effective length: Latin words plus half a point per CJK character. */
  units: number;
  /** Share of eligible blocks (20+ units) that end in a terminal character, or 0 if none. */
  sentenceLikeness: number;
  sentenceEligibleBlocks: number;
  /** Share of blocks whose normalized text appears two or more times. */
  repeatedBlockRatio: number;
  /** Blocks matching a lexicon rule (each under its rule's length cap). */
  lexiconHits: number;
  lexiconHitRate: number;
  /** Link text over text on the raw page's main candidate, or null when that candidate is empty. */
  linkDensity: number | null;
  /** R3 "poor" conditions that force the score below the WebView threshold. */
  hardFails: string[];
  components: QualityComponents;
  lang: string | null;
}

export interface Candidate extends ExtractedArticle {
  extractor: ExtractorName;
  /** Blocks after post-filtering. */
  blocks: Block[];
  text: string;
  removed: RemovedBlock[];
  score: number;
  signals: QualitySignals;
}

export type Decision = 'accept' | 'llm_select' | 'webview';

export interface ExtractResult {
  decision: Decision;
  best: Candidate | null;
  alternatives: Candidate[];
  score: number;
  signals: QualitySignals | null;
  /** Charset used to decode the bytes, or null when the input was already decoded HTML. */
  charset: string | null;
  /** Non-fatal problems, such as an extractor that threw. */
  warnings: string[];
}
