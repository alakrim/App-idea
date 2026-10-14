import type { UsageEntry, UsageStage } from '../domain';

export interface PaidCallInput {
  readonly id: string;
  readonly at: number;
  /** Null for usage that is not tied to a chapter (Ask). */
  readonly chapterId: string | null;
  readonly stage: UsageStage;
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  /** Null when the call's cost is unknown. */
  readonly costUsd: number | null;
  readonly generationId: string | null;
  /** Set for speech calls, which bill by the length of the audio. */
  readonly audioSeconds?: number | null;
}

/**
 * The ledger row for one paid call. Every recorder (the pipeline meter, Ask and Vocab) builds its
 * row here, so an unknown cost is stored the same way everywhere: as null.
 */
export function paidCallEntry(input: PaidCallInput): UsageEntry {
  return {
    id: input.id,
    at: input.at,
    chapterId: input.chapterId,
    stage: input.stage,
    model: input.model,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    audioSeconds: input.audioSeconds ?? null,
    costUsd: input.costUsd,
    generationId: input.generationId,
  };
}
