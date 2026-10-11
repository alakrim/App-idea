import type { ZodError } from 'zod';

import { analysisResponseSchema, normalizeMemory } from './schemas';
import type { AnalysisRequest, LlmTransport } from './llm';
import type { MemoryFields } from './types';

export interface AnalysisResponse {
  readonly memory: MemoryFields;
  /** Cues as the model sent them. validateCues decides which survive. */
  readonly cues: unknown[];
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

function stripCodeFence(text: string): string {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(text);
  return match?.[1] ?? text;
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
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFence(text.trim()));
  } catch {
    return { ok: false, reason: 'reply is not valid JSON' };
  }
  const parsed = analysisResponseSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: summarizeIssues(parsed.error) };
  return {
    ok: true,
    value: { memory: normalizeMemory(parsed.data.memory), cues: parsed.data.cues },
  };
}

/**
 * Calls the model and validates the reply. An invalid reply gets exactly one repair retry, which
 * names the problem. A second invalid reply raises AnalysisOutputError. Transport errors (network,
 * auth, credits) propagate unchanged for the caller to classify.
 */
export async function runAnalysisCall(
  transport: LlmTransport,
  request: AnalysisRequest,
): Promise<AnalysisResponse> {
  const first = parseAnalysisReply(await transport(request));
  if (first.ok) return first.value;

  const repaired = parseAnalysisReply(
    await transport({
      system: request.system,
      user: `${request.user}\n\nYour previous reply could not be used (${first.reason}). Reply again with only the corrected JSON object.`,
    }),
  );
  if (repaired.ok) return repaired.value;
  throw new AnalysisOutputError(`analysis reply invalid after repair: ${repaired.reason}`);
}
