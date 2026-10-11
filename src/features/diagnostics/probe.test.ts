import { runProbe, type ProbeSpec } from './probe';

const spec: ProbeSpec = { id: 'demo', group: 'language', label: 'Demo', timeoutMs: 50 };

describe('runProbe', () => {
  it('reports the outcome with its values and the time it took', async () => {
    const result = await runProbe(spec, () => ({ status: 'pass', values: { count: 2 } }));

    expect(result).toMatchObject({
      id: 'demo',
      group: 'language',
      label: 'Demo',
      status: 'pass',
      values: { count: 2 },
      message: null,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('keeps the message of a failed or skipped probe', async () => {
    const failed = await runProbe(spec, () => ({ status: 'fail', values: {}, message: 'nope' }));
    const skipped = await runProbe(spec, () => ({ status: 'skipped', values: {}, message: 'later' }));

    expect(failed).toMatchObject({ status: 'fail', message: 'nope' });
    expect(skipped).toMatchObject({ status: 'skipped', message: 'later' });
  });

  it('turns a thrown error into an error result, so the screen keeps going', async () => {
    const result = await runProbe(spec, () => {
      throw new Error('native module missing');
    });

    expect(result).toMatchObject({ status: 'error', message: 'native module missing', values: {} });
  });

  it('turns a rejected promise into an error result too', async () => {
    const result = await runProbe(spec, () => Promise.reject(new Error('render failed')));

    expect(result).toMatchObject({ status: 'error', message: 'render failed' });
  });

  it('reports a timeout when the probe never settles, and does not wait for it', async () => {
    const started = Date.now();
    const result = await runProbe(spec, () => new Promise(() => undefined));

    expect(result.status).toBe('timeout');
    expect(result.message).toBe('No result within 50 ms.');
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
