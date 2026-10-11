/**
 * Page extraction for the app: the dual-extractor pipeline from core, reached through one service
 * path. The hidden WebView render that feeds `extractFromHtml` lives in the app layer.
 */
export { extractArticle, extractFromHtml } from '@/core/extract/pipeline';
export type { ExtractInput } from '@/core/extract/pipeline';
export type { ExtractResult } from '@/core/extract/types';
