export type ExtractErrorCode = 'UNSUPPORTED_ENCODING';

/** Typed failure for the extraction pipeline. The caller maps `code` to a fallback, such as the WebView. */
export class ExtractError extends Error {
  readonly code: ExtractErrorCode;

  constructor(code: ExtractErrorCode, message: string) {
    super(message);
    this.name = 'ExtractError';
    this.code = code;
  }
}
