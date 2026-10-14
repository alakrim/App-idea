/**
 * PipelineFacade: the only surface feature UI uses to start, observe and control chapter processing.
 * Implemented by `src/services/pipeline` (brief P2). UI tests use `createFakePipeline()` (fake-facade.ts).
 * Owned by the architect: changing this contract requires updating every implementation.
 */
import { createContext, useContext } from 'react';

import type { PipelineError, Stage } from '@/core/domain';

export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'cancelled';

/** Passages of a stage that narrates in passages: how many are saved, and how many in total. */
export interface PassageProgress {
  done: number;
  total: number;
}

export interface StageProgress {
  stage: Stage;
  status: JobStatus;
  /** 0..1 within the stage. */
  progress: number;
  /** When the stage started running, in epoch milliseconds. Null unless it is running. */
  since: number | null;
  /** Passages of a narration stage, or null for a stage that has none. */
  passages: PassageProgress | null;
}

export interface ChapterProgress {
  chapterId: string;
  /** 'idle' = not queued and not running. */
  state: 'idle' | 'queued' | 'running' | 'ready' | 'failed' | 'cancelled';
  stages: StageProgress[];
  /** Overall 0..1, weighted by typical stage duration. */
  overall: number;
  /** Narration segments already playable (progressive playback). */
  readySegments: number;
  totalSegments: number | null;
  costUsdSoFar: number;
  error: PipelineError | null;
  /** The app came back to the foreground while this chapter was running, and no progress has come since. */
  reconnecting: boolean;
}

export interface CostLine {
  stage: Stage;
  /** The stage's price in USD. Null when it cannot be priced: unknown, never zero. */
  usd: number | null;
  /** Human explanation, e.g. "≈ 7.2k tokens with Claude Haiku 5.5". */
  basis: string;
  /** Why the price is unknown. Null when `usd` is a number. */
  unknownReason: string | null;
}

export interface CostEstimate {
  /** Null when any stage is unknown. */
  totalUsd: number | null;
  lowUsd: number | null;
  highUsd: number | null;
  lines: CostLine[];
}

export interface SourcePreview {
  title: string | null;
  /** First ~400 chars of the cleaned text. */
  excerpt: string;
  wordCount: number;
  detectedLang: string | null;
  /** Quality of the local extraction; 'needs_ai' means the cleanup model will run. */
  quality: 'good' | 'needs_ai' | 'needs_render' | 'empty';
  /** Detected "next chapter" link, if any (user-triggered import only). */
  nextChapterUrl: string | null;
}

export type ChapterInput =
  | { kind: 'url'; url: string }
  | { kind: 'pdf'; fileUri: string; fileName: string }
  | { kind: 'text'; text: string; label: string };

export interface PipelineFacade {
  /** Quick local extraction (no paid calls) to preview a URL before creating the chapter. */
  previewUrl(url: string, signal?: AbortSignal): Promise<SourcePreview>;
  /** Estimate the full processing cost of a chapter from its size and the current settings. */
  estimate(input: {
    chars: number;
    sourceLang: string | null;
    targetLang: string | null;
  }): Promise<CostEstimate>;
  /** Create the chapter row and store the source (raw bytes / file copy). Returns the chapter id. */
  createChapter(input: {
    seriesId: string;
    title: string | null;
    source: ChapterInput;
  }): Promise<string>;
  /** Queue processing. Idempotent if it is already queued or running. */
  enqueue(chapterId: string): void;
  cancel(chapterId: string): void;
  /**
   * Cancels the runs of these chapters and resolves once the queue has settled, or after a timeout.
   * Rows and files must not be deleted while a run can still write them.
   */
  stop(chapterIds: readonly string[]): Promise<void>;
  /** Re-run from a stage (default: the first failed one). */
  retry(chapterId: string, from?: Stage): void;
  /** Re-run with OCR after a scanned-PDF failure (paid; the UI must confirm the cost first). */
  retryWithOcr(chapterId: string): void;
  /** Subscribe to one chapter's progress. Returns an unsubscribe function. Emits immediately with the current snapshot. */
  subscribe(chapterId: string, listener: (p: ChapterProgress) => void): () => void;
}

export const PipelineContext = createContext<PipelineFacade | null>(null);

export function usePipeline(): PipelineFacade {
  const facade = useContext(PipelineContext);
  if (!facade) throw new Error('usePipeline must be used inside <PipelineContext.Provider>');
  return facade;
}
