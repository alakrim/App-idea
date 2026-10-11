import type { Id, Job, JobStatus, PipelineError, Stage } from '../domain';
import type { PipelinePorts } from './ports';

export interface JobState {
  readonly status: JobStatus;
  readonly inputHash: string;
  readonly model: string | null;
  readonly promptVersion: string | null;
  readonly progress: number;
  readonly costUsd: number;
  readonly error: PipelineError | null;
}

/**
 * Writes the state of a stage's job. The row keeps its id, and `attempt` counts the times the
 * stage has started running.
 */
export async function writeJob(
  ports: Pick<PipelinePorts, 'jobs' | 'clock' | 'ids'>,
  chapterId: Id,
  stage: Stage,
  state: JobState,
): Promise<Job> {
  const existing = await ports.jobs.get(chapterId, stage);
  const now = ports.clock.now();
  const starting = state.status === 'running';
  const job: Job = {
    id: existing?.id ?? ports.ids(),
    chapterId,
    stage,
    status: state.status,
    attempt: (existing?.attempt ?? 0) + (starting ? 1 : 0),
    inputHash: state.inputHash,
    model: state.model,
    promptVersion: state.promptVersion,
    progress: state.progress,
    error: state.error,
    costUsd: state.costUsd,
    startedAt: starting ? now : (existing?.startedAt ?? null),
    finishedAt: starting ? null : now,
  };
  await ports.jobs.upsert(job);
  return job;
}
