import type { StageProgress } from '@/features/pipeline/facade';

import { describeSteps, stepStates } from './stage-steps';

function stage(
  name: StageProgress['stage'],
  status: StageProgress['status'],
  progress = 0,
): StageProgress {
  return { stage: name, status, progress };
}

describe('stepStates', () => {
  it('shows every step as waiting before anything has run', () => {
    const steps = stepStates(null);

    expect(steps.map((step) => step.status)).toEqual([
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    expect(steps.map((step) => step.label)).toEqual([
      'Extract',
      'Clean',
      'Analyze',
      'Translate',
      'Narrate',
    ]);
  });

  it('marks finished steps done, the active one running with its progress, and the rest pending', () => {
    const steps = stepStates([
      stage('extract', 'done', 1),
      stage('clean', 'done', 1),
      stage('segment', 'done', 1),
      stage('analyze', 'running', 0.4),
      stage('translate', 'pending'),
      stage('narrate', 'pending'),
    ]);

    expect(steps.map((step) => step.status)).toEqual([
      'done',
      'done',
      'running',
      'pending',
      'pending',
    ]);
    expect(steps[2]?.progress).toBe(0.4);
  });

  it('folds segment into Clean, so Clean is only done once both are', () => {
    const steps = stepStates([stage('clean', 'done', 1), stage('segment', 'running', 0.5)]);

    expect(steps[1]).toMatchObject({ id: 'clean', status: 'running' });
  });

  it('reports a failed step with the failure, and a skipped translation as not needed', () => {
    const steps = stepStates([
      stage('extract', 'done', 1),
      stage('clean', 'failed', 0.2),
      stage('translate', 'skipped', 1),
    ]);

    expect(steps[1]?.status).toBe('failed');
    expect(steps[3]?.status).toBe('skipped');
    expect(describeSteps(steps)).toContain('Clean failed');
    expect(describeSteps(steps)).toContain('Translate not needed');
  });
});
