/*
 * The chapter runner (ADR-0008). Extract and segment run in order. Then analyze, translate and
 * narrate run at once: analysis is off the critical path, and narration streams the sentences that
 * translation has made final. The chapter is ready only when all three succeed.
 *
 * Failures: the first failure is recorded before anything awaits, and then the shared signal aborts
 * the other stages. Their cancellation is recorded silently, so the chapter shows one error. A
 * user's cancel is one error too. The runner never retries; the caller decides.
 *
 * Every stage writes one job row. A job that is done with the same input hash is skipped.
 */
import type { PipelineError, Stage } from '@/core/domain';
import { throwIfCancelled } from '@/core/llm/transport';

import { isCancellation, StageFailure, toPipelineError } from './errors';
import { writeJob } from './job-records';
import { CostMeter } from './meter';
import { SpokenTextGate } from './spoken-text';
import {
  analyzeStage,
  extractStage,
  narrateStage,
  segmentStage,
  STAGE_ORDER,
  translateStage,
} from './stages';
import { storedSpokenTexts } from './stages/translate';

import type {
  FlowContext,
  PipelineEvent,
  PreparedStage,
  StageContext,
  StageDefinition,
} from './context';
import type { JobState } from './job-records';
import type { Clock, NetworkEvent, PdfEngine, PipelinePorts } from './ports';
import { MAX_STALLS, STALLED_ERROR, StallWatchdog } from './stall-watchdog';
import type { SpokenSource } from './spoken-text';

export interface RunOptions {
  /** The clock the stall watchdog reads. Defaults to the ports' clock. */
  readonly clock?: Clock;
  /**
   * True while a platform foreground service keeps the JS runtime alive in the background. The
   * watchdog then keeps counting when the app leaves the foreground, because nothing is frozen.
   */
  readonly keepsAliveInBackground?: () => boolean;
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: PipelineEvent) => void;
  /** Starts at this stage. Earlier stages are left as they are. */
  readonly from?: Stage;
  /** Runs stages even when their job is done with the same input hash. */
  readonly force?: boolean;
  /** The PDF engine. Defaults to the free `cloudflare-ai`. Use `mistral-ocr` only after the user agrees to its cost. */
  readonly pdfEngine?: PdfEngine;
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
  const first = options.from === undefined ? 0 : Math.max(0, STAGE_ORDER.indexOf(options.from));
  if ((await ports.chapters.load(chapterId)) === null) {
    return {
      status: 'failed',
      stage: 'extract',
      error: { code: 'UNKNOWN', message: MISSING_CHAPTER, retryable: false },
    };
  }
  await ports.chapters.setStatus(chapterId, 'processing');

  const run = new ChapterRun(chapterId, ports, options);
  run.startWatch();
  const started = (stage: Stage): boolean => STAGE_ORDER.indexOf(stage) >= first;

  for (const definition of [extractStage, segmentStage]) {
    if (run.stopped || !started(definition.stage)) continue;
    await run.stage(definition, (base) => base);
  }
  if (!run.stopped) await runConcurrently(run, started);
  return run.finish();
}

/**
 * Analyze, translate and narrate at once. Narration reads the spoken text as translation publishes
 * it, and the opening window of translation does not wait for analysis.
 */
async function runConcurrently(run: ChapterRun, started: (stage: Stage) => boolean): Promise<void> {
  const sentences = await run.ports.chapters.getSentences(run.chapterId);
  const sources: SpokenSource[] = sentences.map((s) => ({
    idx: s.idx,
    paragraphIdx: s.paragraphIdx,
    kind: s.kind,
    text: s.text,
  }));
  const spoken = new SpokenTextGate(sources);
  const analysis = deferred();
  const flow = (base: StageContext): FlowContext => ({
    ...base,
    spoken,
    analysisDone: analysis.promise,
  });

  const analyzing = async (): Promise<void> => {
    if (!started(analyzeStage.stage)) {
      analysis.resolve();
      return;
    }
    if (await run.stage(analyzeStage, (base) => base)) {
      run.emit({ type: 'analysisReady', chapterId: run.chapterId });
      analysis.resolve();
    }
  };
  const translating = async (): Promise<void> => {
    if (started(translateStage.stage)) {
      await run.stage(translateStage, flow, spoken);
    } else {
      spoken.publish(storedSpokenTexts(sentences));
    }
  };

  await Promise.all([analyzing(), translating(), run.stage(narrateStage, flow, spoken)]);
}

/** A promise that the caller resolves. It is never rejected: a failed analysis leaves it pending. */
function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve: () => resolve() };
}

/** The state of one run: its shared signal, its first failure or cancellation, and its cost total. */
class ChapterRun {
  private readonly controller = new AbortController();
  private readonly external: AbortSignal | undefined;
  private readonly onEvent: (event: PipelineEvent) => void;
  private readonly pdfEngine: PdfEngine;
  private readonly force: boolean;
  private failed: { readonly stage: Stage; readonly error: PipelineError } | null = null;
  /** The stage the run is in, so events name it. */
  private currentStage: Stage;
  /** Set when the watchdog fails the run: the chapter fails with it, not as cancelled. */
  private stallError: PipelineError | null = null;
  private readonly watchdog: StallWatchdog;
  private readonly keepsAlive: () => boolean;
  private readonly unsubscribeNetwork: () => void;
  private cancelledAt: Stage | null = null;
  private runTotal = 0;

  constructor(
    readonly chapterId: string,
    readonly ports: PipelinePorts,
    options: RunOptions,
  ) {
    this.onEvent = options.onEvent ?? (() => undefined);
    this.pdfEngine = options.pdfEngine ?? 'cloudflare-ai';
    this.force = options.force === true;
    this.external = options.signal;
    this.currentStage = options.from ?? 'extract';
    this.keepsAlive = options.keepsAliveInBackground ?? (() => false);
    this.watchdog = new StallWatchdog({
      now: () => (options.clock ?? ports.clock).now(),
      onStall: (stalls) => this.onStall(stalls),
    });
    this.unsubscribeNetwork = ports.network.subscribe((event) => this.onNetwork(event));
    if (this.external?.aborted === true) this.controller.abort();
    else this.external?.addEventListener('abort', () => this.controller.abort(), { once: true });
  }

  /** The signal every stage of the run shares. Aborting it cancels all of them. */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /** True once a stage has failed or been cancelled. The stages still running are then stopped. */
  get stopped(): boolean {
    return this.failed !== null || this.cancelledAt !== null || this.stallError !== null;
  }

  /** Starts the stall watchdog. It stops when the run finishes. */
  startWatch(): void {
    this.watchdog.start();
  }

  /** Every event passes here. It counts as activity, and it tracks the stage the run is in. */
  emit(event: PipelineEvent): void {
    if (event.chapterId === this.chapterId) {
      this.watchdog.touch();
      if ('stage' in event) this.currentStage = event.stage;
    }
    this.onEvent(event);
  }

  /**
   * The first stalls retire the requests in flight, so each is retried at once. A stall beyond
   * MAX_STALLS fails the chapter; its finished passages stay saved.
   */
  private onStall(stalls: number): void {
    this.onEvent({ type: 'stall', chapterId: this.chapterId, stage: this.currentStage, count: stalls });
    if (stalls >= MAX_STALLS) {
      this.stallError = STALLED_ERROR;
      this.watchdog.stop();
      this.controller.abort();
      return;
    }
    this.ports.network.retireInFlight();
  }

  private onNetwork(event: NetworkEvent): void {
    switch (event.type) {
      case 'attempt':
        this.watchdog.touch(event.timeoutMs);
        return;
      case 'staleAbort':
        this.onEvent({ type: 'staleAbort', chapterId: this.chapterId, stage: this.currentStage });
        return;
      case 'backgrounded':
        if (!this.keepsAlive()) this.watchdog.suspend();
        return;
      case 'resumed':
        this.watchdog.resume();
        this.onEvent({ type: 'reconnecting', chapterId: this.chapterId });
        return;
    }
  }

  /**
   * Runs one stage and records its job. Returns true when it ended without failure or cancellation.
   * Never throws: every error is recorded here, so a stage running beside it is not left hanging.
   * `spoken` is the gate that a skipped stage settles its text into.
   */
  async stage<C extends StageContext>(
    definition: StageDefinition<C>,
    extend: (base: StageContext) => C,
    spoken?: SpokenTextGate,
  ): Promise<boolean> {
    const { stage } = definition;
    const { ports, chapterId } = this;
    let prepared: PreparedStage | null = null;
    let meter: CostMeter | null = null;
    try {
      throwIfCancelled(this.signal);
      const record = await ports.chapters.load(chapterId);
      if (!record) throw new StageFailure('UNKNOWN', MISSING_CHAPTER, { retryable: false });
      meter = new CostMeter({
        ports,
        chapterId,
        stage,
        onSpend: (usd) => {
          this.runTotal += usd;
          this.emit({ type: 'cost', chapterId, stage, usd, totalUsd: this.runTotal });
        },
      });
      const base: StageContext = {
        chapterId,
        record,
        ports,
        options: { pdfEngine: this.pdfEngine, force: this.force },
        signal: this.signal,
        meter,
        emit: (event) => this.emit(event),
      };
      prepared = await definition.prepare(extend(base));
      const existing = await ports.jobs.get(chapterId, stage);

      if (prepared.skip) {
        settle(prepared, spoken);
        await writeJob(ports, chapterId, stage, jobState(prepared, 'skipped', 1, 0, null));
        this.emit({ type: 'stage', chapterId, stage, status: 'skipped' });
        return true;
      }
      if (
        !this.force &&
        existing?.status === 'done' &&
        prepared.inputHash !== null &&
        existing.inputHash === prepared.inputHash
      ) {
        settle(prepared, spoken);
        this.emit({ type: 'stage', chapterId, stage, status: 'skipped' });
        return true;
      }

      await writeJob(ports, chapterId, stage, jobState(prepared, 'running', 0, 0, null));
      this.emit({ type: 'stage', chapterId, stage, status: 'running' });
      const execution = await prepared.execute();
      const status = execution?.status ?? 'done';
      const inputHash = execution?.inputHash ?? prepared.inputHash ?? '';
      await writeJob(
        ports,
        chapterId,
        stage,
        jobState(prepared, status, 1, meter.spentUsd, null, inputHash),
      );
      this.emit({ type: 'stage', chapterId, stage, status });
      return true;
    } catch (thrown) {
      await this.recordError(stage, thrown, prepared, meter?.spentUsd ?? 0);
      return false;
    }
  }

  /** The run's outcome. A chapter is marked ready here, once every stage has settled. */
  async finish(): Promise<RunOutcome> {
    this.watchdog.stop();
    this.unsubscribeNetwork();
    if (this.stallError !== null) {
      return { status: 'failed', stage: this.currentStage, error: this.stallError };
    }
    if (this.failed !== null) {
      return { status: 'failed', stage: this.failed.stage, error: this.failed.error };
    }
    if (this.cancelledAt !== null) return { status: 'cancelled', stage: this.cancelledAt };
    await this.ports.chapters.setStatus(this.chapterId, 'ready');
    this.emit({ type: 'done', chapterId: this.chapterId });
    return { status: 'ready' };
  }

  private async recordError(
    stage: Stage,
    thrown: unknown,
    prepared: PreparedStage | null,
    spentUsd: number,
  ): Promise<void> {
    const { ports, chapterId } = this;
    // A stage that errors after the run has already stopped is a sibling of that first error.
    if (this.stopped) {
      await writeJob(ports, chapterId, stage, jobState(prepared, 'cancelled', 0, spentUsd, null));
      this.emit({ type: 'stage', chapterId, stage, status: 'cancelled' });
      return;
    }
    if (isCancellation(thrown) || this.external?.aborted === true) {
      this.cancelledAt = stage;
      this.controller.abort();
      await writeJob(ports, chapterId, stage, jobState(prepared, 'cancelled', 0, spentUsd, null));
      await ports.jobs.cancelUnfinished(chapterId);
      await ports.chapters.setStatus(chapterId, 'draft');
      this.emit({ type: 'stage', chapterId, stage, status: 'cancelled' });
      this.emit({
        type: 'error',
        chapterId,
        stage,
        error: { code: 'CANCELLED', message: 'Cancelled.', retryable: false },
      });
      return;
    }
    const error = toPipelineError(thrown);
    this.failed = { stage, error };
    this.controller.abort();
    await writeJob(ports, chapterId, stage, jobState(prepared, 'failed', 0, spentUsd, error));
    await ports.chapters.setStatus(chapterId, 'failed');
    this.emit({ type: 'stage', chapterId, stage, status: 'failed' });
    this.emit({ type: 'error', chapterId, stage, error });
  }
}

/** Publishes the text a stage that does not run settles to, so narration can proceed past it. */
function settle(prepared: PreparedStage, spoken: SpokenTextGate | undefined): void {
  if (prepared.settled !== undefined && spoken !== undefined) spoken.publish(prepared.settled);
}

function jobState(
  prepared: PreparedStage | null,
  status: JobState['status'],
  progress: number,
  costUsd: number,
  error: PipelineError | null,
  inputHash: string = prepared?.inputHash ?? '',
): JobState {
  return {
    status,
    inputHash,
    model: prepared?.model ?? null,
    promptVersion: prepared?.promptVersion ?? null,
    progress,
    costUsd,
    error,
  };
}
