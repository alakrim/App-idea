/*
 * The chapter runner: runs the stages in order, skipping any whose job is already done with the
 * same input hash. It records every job, updates the chapter status and emits progress events. It
 * never retries. Retryable failures are the client's job, and the caller decides what to do.
 */
import type { PipelineError, Stage } from '@/core/domain';
import { throwIfCancelled } from '@/core/llm/transport';

import { isCancellation, StageFailure, toPipelineError } from './errors';
import { writeJob } from './job-records';
import { CostMeter } from './meter';
import { STAGE_DEFINITIONS, STAGE_ORDER } from './stages';

import type { PipelineEvent, PreparedStage, StageContext } from './context';
import type { JobState } from './job-records';
import type { PdfEngine, PipelinePorts } from './ports';

export interface RunOptions {
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: PipelineEvent) => void;
  /** Starts at this stage. Earlier stages are left as they are. */
  readonly from?: Stage;
  /** Runs stages even when their job is done with the same input hash. */
  readonly force?: boolean;
  /** The PDF engine. Defaults to the free `cloudflare-ai`. Use `mistral-ocr` only after the user agrees to its cost. */
  readonly pdfEngine?: PdfEngine;
  /**
   * Why the owner stopped the run, when it was not the user: the stall watchdog after too many
   * stalls. Read once the run is interrupted, so the chapter fails with that error instead of
   * being reported as cancelled.
   */
  readonly stopped?: () => PipelineError | null;
}

export type RunOutcome =
  | { readonly status: 'ready' }
  | { readonly status: 'failed'; readonly stage: Stage; readonly error: PipelineError }
  | { readonly status: 'cancelled'; readonly stage: Stage };

const MISSING_CHAPTER = 'This chapter no longer exists.';

export async function runChapter(
  chapterId: string,
  ports: PipelinePorts,
  options: RunOptions = {},
): Promise<RunOutcome> {
  const signal = options.signal ?? new AbortController().signal;
  const emit = options.onEvent ?? (() => undefined);
  const pdfEngine = options.pdfEngine ?? 'cloudflare-ai';
  const first = options.from === undefined ? 0 : Math.max(0, STAGE_ORDER.indexOf(options.from));

  if ((await ports.chapters.load(chapterId)) === null) {
    return {
      status: 'failed',
      stage: 'extract',
      error: { code: 'UNKNOWN', message: MISSING_CHAPTER, retryable: false },
    };
  }
  await ports.chapters.setStatus(chapterId, 'processing');

  let runTotal = 0;
  for (const definition of STAGE_DEFINITIONS.slice(first)) {
    const stage = definition.stage;
    let prepared: PreparedStage | null = null;
    let meter: CostMeter | null = null;
    try {
      throwIfCancelled(signal);
      const record = await ports.chapters.load(chapterId);
      if (!record) throw new StageFailure('UNKNOWN', MISSING_CHAPTER, { retryable: false });

      meter = new CostMeter({
        ports,
        chapterId,
        stage,
        onSpend: (usd) => {
          runTotal += usd;
          emit({ type: 'cost', chapterId, stage, usd, totalUsd: runTotal });
        },
      });
      const ctx: StageContext = {
        chapterId,
        record,
        ports,
        options: { pdfEngine },
        signal,
        meter,
        emit,
      };
      prepared = await definition.prepare(ctx);
      const existing = await ports.jobs.get(chapterId, stage);

      if (prepared.skip) {
        await writeJob(ports, chapterId, stage, jobState(prepared, 'skipped', 1, 0, null));
        emit({ type: 'stage', chapterId, stage, status: 'skipped' });
        continue;
      }
      if (
        !options.force &&
        existing?.status === 'done' &&
        existing.inputHash === prepared.inputHash
      ) {
        emit({ type: 'stage', chapterId, stage, status: 'skipped' });
        continue;
      }

      await writeJob(ports, chapterId, stage, jobState(prepared, 'running', 0, 0, null));
      emit({ type: 'stage', chapterId, stage, status: 'running' });
      await prepared.execute();
      await writeJob(ports, chapterId, stage, jobState(prepared, 'done', 1, meter.spentUsd, null));
      emit({ type: 'stage', chapterId, stage, status: 'done' });
    } catch (thrown) {
      const spent = meter?.spentUsd ?? 0;
      const stopError = options.stopped?.() ?? null;
      if (stopError === null && (signal.aborted || isCancellation(thrown))) {
        await writeJob(ports, chapterId, stage, jobState(prepared, 'cancelled', 0, spent, null));
        await ports.jobs.cancelUnfinished(chapterId);
        await ports.chapters.setStatus(chapterId, 'draft');
        emit({ type: 'stage', chapterId, stage, status: 'cancelled' });
        emit({
          type: 'error',
          chapterId,
          stage,
          error: { code: 'CANCELLED', message: 'Cancelled.', retryable: false },
        });
        return { status: 'cancelled', stage };
      }
      const error = stopError ?? toPipelineError(thrown);
      await writeJob(ports, chapterId, stage, jobState(prepared, 'failed', 0, spent, error));
      await ports.chapters.setStatus(chapterId, 'failed');
      emit({ type: 'stage', chapterId, stage, status: 'failed' });
      emit({ type: 'error', chapterId, stage, error });
      return { status: 'failed', stage, error };
    }
  }

  await ports.chapters.setStatus(chapterId, 'ready');
  emit({ type: 'done', chapterId });
  return { status: 'ready' };
}

function jobState(
  prepared: PreparedStage | null,
  status: JobState['status'],
  progress: number,
  costUsd: number,
  error: PipelineError | null,
): JobState {
  return {
    status,
    inputHash: prepared?.inputHash ?? '',
    model: prepared?.model ?? null,
    promptVersion: prepared?.promptVersion ?? null,
    progress,
    costUsd,
    error,
  };
}
