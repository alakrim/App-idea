import { ANALYSIS_JSON_SCHEMA, analysisResponseSchema, normalizeMemory } from './schemas';
import { stripNulls } from './strip-nulls';
import { parseJsonReply } from '../llm/json';
import { addUsage } from '../llm/transport';

import type { MemoryFields } from './types';
import type { LlmTransport, LlmUsage } from '../llm/transport';
import type { ZodError } from 'zod';

export interface AnalysisResponse {
  readonly memory: MemoryFields;
  /** Cues as the model sent them. validateCues decides which survive. */
  readonly cues: unknown[];
}

/** One analysis call's result, with the usage of every model call it made, repairs included. */
export interface AnalysisCallResult extends AnalysisResponse {
  readonly usage: LlmUsage;
}

/** The system and user messages of one analysis call. */
export interface AnalysisRequest {
  readonly system: string;
  readonly user: string;
}

export type ParseOutcome =
  | { readonly ok: true; readonly value: AnalysisResponse }
  | { readonly ok: false; readonly reason: string };

/** Raised when the model's reply is still invalid after the one repair retry. */
export class AnalysisOutputError extends Error {
  readonly code = 'LLM_INVALID_OUTPUT' as const;

  constructor(message: string) {
    super(message);
    this.name = 'AnalysisOutputError';
  }
}

/** A short, content-free summary of zod issues. Reply text is never echoed back or logged. */
function summarizeIssues(error: ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.map(String).join('.') || 'root'}: ${issue.message}`)
    .join('; ');
}

/** Parses and validates one reply from the model. Pure, so it is easy to test. */
export function parseAnalysisReply(text: string): ParseOutcome {
  const json = parseJsonReply(text);
  if (!json.ok) return { ok: false, reason: 'reply is not valid JSON' };
  const parsed = analysisResponseSchema.safeParse(json.value);
  if (!parsed.success) return { ok: false, reason: summarizeIssues(parsed.error) };
  return {
    ok: true,
    value: { memory: normalizeMemory(stripNulls(parsed.data.memory)), cues: parsed.data.cues },
  };
}

/**
 * Calls the model and validates the reply. An invalid reply gets exactly one repair retry, which
 * names the problem. A second invalid reply raises AnalysisOutputError. Transport errors (network,
 * auth, credits, cancellation) propagate unchanged for the caller to classify.
 */
export async function runAnalysisCall(
  transport: LlmTransport,
  request: AnalysisRequest,
  signal?: AbortSignal,
): Promise<AnalysisCallResult> {
  const first = await transport({
    system: request.system,
    user: request.user,
    jsonSchema: ANALYSIS_JSON_SCHEMA,
    signal,
  });
  const firstOutcome = parseAnalysisReply(first.text);
  if (firstOutcome.ok) return { ...firstOutcome.value, usage: first.usage };

  const second = await transport({
    system: request.system,
    user: `${request.user}\n\nYour previous reply could not be used (${firstOutcome.reason}). Reply again with only the corrected JSON object.`,
    jsonSchema: ANALYSIS_JSON_SCHEMA,
    signal,
  });
  const usage = addUsage(first.usage, second.usage);
  const repaired = parseAnalysisReply(second.text);
  if (repaired.ok) return { ...repaired.value, usage };
  throw new AnalysisOutputError(`analysis reply invalid after repair: ${repaired.reason}`);
}
