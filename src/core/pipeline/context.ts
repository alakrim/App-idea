import type { Id, PipelineError, Stage } from '../domain';
import type { ChapterRecord, PdfEngine, PipelinePorts } from './ports';
import type { CostMeter } from './meter';

/** A narration segment that is saved and playable. Emitted in order, for progressive playback. */
export interface SegmentReady {
  readonly idx: number;
  readonly sentenceStart: number;
  readonly sentenceEnd: number;
  readonly durationMs: number;
  readonly uri: string;
}

export type JobStatusEvent = 'running' | 'done' | 'skipped' | 'failed' | 'cancelled';

export type PipelineEvent =
  | { readonly type: 'stage'; readonly chapterId: Id; readonly stage: Stage; readonly status: JobStatusEvent }
  | { readonly type: 'progress'; readonly chapterId: Id; readonly stage: Stage; readonly progress: number }
  | { readonly type: 'segmentReady'; readonly chapterId: Id; readonly segment: SegmentReady }
  | { readonly type: 'cost'; readonly chapterId: Id; readonly stage: Stage; readonly usd: number; readonly totalUsd: number }
  | { readonly type: 'done'; readonly chapterId: Id }
  | { readonly type: 'error'; readonly chapterId: Id; readonly stage: Stage; readonly error: PipelineError };

/** Per-run choices that the stages read. */
export interface StageOptions {
  /** The PDF engine. `mistral-ocr` is only used after the user confirms its cost. */
  readonly pdfEngine: PdfEngine;
}

export interface StageContext {
  readonly chapterId: Id;
  readonly record: ChapterRecord;
  readonly ports: PipelinePorts;
  readonly options: StageOptions;
  readonly signal: AbortSignal;
  /** Records the cost of every model and speech call this stage makes. */
  readonly meter: CostMeter;
  readonly emit: (event: PipelineEvent) => void;
}

/**
 * A stage ready to run. `prepare` loads its inputs and computes the input hash, so the runner can
 * skip it when its job is already done with the same hash. `skip` marks a stage that has nothing
 * to do for this chapter (for example, translation with no target language).
 */
export interface PreparedStage {
  readonly inputHash: string;
  readonly model: string | null;
  readonly promptVersion: string | null;
  readonly skip: boolean;
  execute(): Promise<void>;
}

export interface StageDefinition {
  readonly stage: Stage;
  prepare(ctx: StageContext): Promise<PreparedStage>;
}
