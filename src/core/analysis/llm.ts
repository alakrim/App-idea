/**
 * The injected LLM transport. The engine never imports the OpenRouter client. The app layer
 * supplies a function that sends `system` and `user` to the chosen model and resolves with the
 * model's text. Usage accounting and retries for transport errors belong to that layer.
 */
export interface AnalysisRequest {
  readonly system: string;
  readonly user: string;
}

export type LlmTransport = (request: AnalysisRequest) => Promise<string>;
