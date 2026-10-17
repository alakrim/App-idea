import type { Id, PipelineError, Stage } from '../domain';
import type { CostMeter } from './meter';
import type { ChapterRecord, PdfEngine, PipelinePorts } from './ports';
import type { SpokenTextGate } from './spoken-text';

/** How a segment's audio was made. Null for a segment that was already saved and reused. */
export interface SegmentSynthesis {
  /** Wall-clock time of the request. */
  readonly ms: number;
  /** Requests the window had open when this one started. */
  readonly slots: number;
}

/** A narration segment that is saved and playable. Emitted in order, for progressive playback. */
export interface SegmentReady {
  readonly idx: number;
  readonly sentenceStart: number;
  readonly sentenceEnd: number;
  readonly durationMs: number;
  readonly uri: string;
  /** Characters the segment speaks. */
  readonly chars: number;
  readonly synthesis: SegmentSynthesis | null;
}

export type JobStatusEvent = 'running' | 'done' | 'skipped' | 'failed' | 'cancelled';

export type PipelineEvent =
  | {
      readonly type: 'stage';
      readonly chapterId: Id;
      readonly stage: Stage;
      readonly status: JobStatusEvent;
    }
  | {
      readonly type: 'progress';
      readonly chapterId: Id;
      readonly stage: Stage;
      readonly progress: number;
    }
  | { readonly type: 'segmentReady'; readonly chapterId: Id; readonly segment: SegmentReady }
  /** The first segment of the chapter is saved. Emitted once per run. */
  | { readonly type: 'playable'; readonly chapterId: Id }
  /** The chapter's cues and memory are in the database. */
  | { readonly type: 'analysisReady'; readonly chapterId: Id }
  /** The characters the narration will speak, as far as they are final. It changes while translation runs. */
  | { readonly type: 'spokenChars'; readonly chapterId: Id; readonly chars: number }
  | {
      readonly type: 'cost';
      readonly chapterId: Id;
      readonly stage: Stage;
      readonly usd: number;
      readonly totalUsd: number;
    }
  | { readonly type: 'done'; readonly chapterId: Id }
  | {
      readonly type: 'error';
      readonly chapterId: Id;
      readonly stage: Stage;
      readonly error: PipelineError;
    };

/** Per-run choices that the stages read. */
export interface StageOptions {
  /** The PDF engine. `mistral-ocr` is only used after the user confirms its cost. */
  readonly pdfEngine: PdfEngine;
  /** Runs stages even when their job is done with the same input. */
  readonly force: boolean;
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
 * The context of the stages that run beside analysis: translation and narration. The spoken text
 * is what translation publishes and narration reads, and analysis resolves `analysisDone`.
 */
export interface FlowContext extends StageContext {
  readonly spoken: SpokenTextGate;
  /** Resolves when the chapter's analysis has finished successfully. Never rejects. */
  readonly analysisDone: Promise<void>;
}

/** What a stage's execution settled to. A stage returns this only when its job row needs more than the default. */
export interface StageExecution {
  /** The input hash of the job, when it is only known once the stage has run. */
  readonly inputHash: string;
  /** `skipped` when the stage found its output already in place and made no new calls. */
  readonly status: 'done' | 'skipped';
}

/**
 * A stage ready to run. `prepare` loads its inputs and computes the input hash, so the runner can
 * skip it when its job is already done with the same hash. `skip` marks a stage that has nothing
 * to do for this chapter (for example, translation with no target language).
 */
export interface PreparedStage {
  /** Null when the hash is known only once the stage has run (narration streams its segments). */
  readonly inputHash: string | null;
  readonly model: string | null;
  readonly promptVersion: string | null;
  readonly skip: boolean;
  /**
   * The final spoken text this stage settles to when it does not run: the translation that is in
   * place, or the source text. The runner publishes it so that narration can proceed.
   */
  readonly settled?: ReadonlyMap<number, string>;
  execute(): Promise<StageExecution | void>;
}

export interface StageDefinition<C extends StageContext = StageContext> {
  readonly stage: Stage;
  prepare(ctx: C): Promise<PreparedStage>;
}
