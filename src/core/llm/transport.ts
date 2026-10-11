/**
 * The injected LLM transport (ADR-0006 §4). The core never imports the OpenRouter client. The app
 * layer binds a transport to one model, wraps the OpenRouter client, and maps its failures to
 * PipelineError codes. Retries for transient failures belong to that layer.
 */

/** A JSON Schema the reply must follow. Sent as strict `json_schema` when the model supports it. */
export interface JsonSchemaSpec {
  readonly name: string;
  readonly schema: object;
}

export interface LlmRequest {
  readonly system: string;
  readonly user: string;
  readonly jsonSchema?: JsonSchemaSpec;
  readonly signal?: AbortSignal;
}

export interface LlmUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  /** Provider-reported cost in USD, or null when the reply carried none. */
  readonly costUsd: number | null;
}

export interface LlmReply {
  readonly text: string;
  readonly usage: LlmUsage;
}

export type LlmTransport = (request: LlmRequest) => Promise<LlmReply>;

export const ZERO_USAGE: LlmUsage = { promptTokens: 0, completionTokens: 0, costUsd: 0 };

/** Sums two usages. The cost stays unknown (null) when either side is unknown. */
export function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    costUsd: a.costUsd === null || b.costUsd === null ? null : a.costUsd + b.costUsd,
  };
}

/** Raised when the caller's signal is aborted. Carries the PipelineError code CANCELLED. */
export class LlmCancelledError extends Error {
  readonly code = 'CANCELLED' as const;

  constructor() {
    super('LLM call cancelled');
    this.name = 'AbortError';
  }
}

/** Throws LlmCancelledError when `signal` is aborted. Called between model calls. */
export function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new LlmCancelledError();
}
