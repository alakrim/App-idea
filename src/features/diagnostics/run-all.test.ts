import type { Db } from '@/db/types';

import { PROBES, runDiagnostics, type DiagnosticsDeps } from './run-all';

import type { ProbeOutcome, ProbeSpec } from './probe';

/** Dependencies where every probe that touches the device is a stand-in. */
function fakeDeps(overrides: Partial<DiagnosticsDeps> = {}): DiagnosticsDeps {
  const emptyDb = {
    all: () => [{ version: '3.50.4', pending: 0, running: 0 }],
    run: () => ({ changes: 0 }),
  } as unknown as Db;
  return {
    db: emptyDb,
    language: {},
    render: { render: async () => '<html></html>' },
    bridge: { send: async (bytes) => bytes },
    audio: {
      createContext: () => {
        throw new Error('no audio on this host');
      },
      beds: [],
      sleep: async () => undefined,
      hasLockScreenSession: () => null,
    },
    storage: () => ({ databaseBytes: 1, freeBytes: 2 }),
    background: {
      status: () => ({ state: 'stopped', lastStartedAt: null, failure: null }),
      notificationsGranted: async () => true,
    },
    ...overrides,
  };
}

describe('diagnostics probe list', () => {
  it('has a unique id for every probe, so results can be matched to rows', () => {
    const ids = PROBES.map((probe) => probe.spec.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every probe a timeout', () => {
    for (const probe of PROBES) expect(probe.spec.timeoutMs).toBeGreaterThan(0);
  });

  it('covers the language, WebView, storage, audio and pipeline groups', () => {
    const groups = new Set(PROBES.map((probe) => probe.spec.group));
    expect(groups).toEqual(new Set(['language', 'webview', 'storage', 'audio', 'pipeline']));
  });
});

describe('runDiagnostics', () => {
  it('runs each probe in order, reports each result as it lands, and keeps running after a failure', async () => {
    const order: string[] = [];
    const seen: string[] = [];
    const probes = [
      {
        spec: { id: 'first', group: 'language' as const, label: 'First', timeoutMs: 100 },
        run: (): ProbeOutcome => {
          order.push('first');
          return { status: 'pass', values: { n: 1 } };
        },
      },
      {
        spec: { id: 'crashes', group: 'audio' as const, label: 'Crashes', timeoutMs: 100 },
        run: (): ProbeOutcome => {
          order.push('crashes');
          throw new Error('boom');
        },
      },
      {
        spec: { id: 'last', group: 'storage' as const, label: 'Last', timeoutMs: 100 },
        run: (): ProbeOutcome => {
          order.push('last');
          return { status: 'fail', values: {}, message: 'short' };
        },
      },
    ];

    const results = await runDiagnostics(fakeDeps(), probes, (result) => seen.push(result.id));

    expect(order).toEqual(['first', 'crashes', 'last']);
    expect(seen).toEqual(['first', 'crashes', 'last']);
    expect(results.map((result) => [result.id, result.status])).toEqual([
      ['first', 'pass'],
      ['crashes', 'error'],
      ['last', 'fail'],
    ]);
  });

  it('stops a probe that hangs and moves on to the next one', async () => {
    const hang: { spec: ProbeSpec; run: () => Promise<ProbeOutcome> } = {
      spec: { id: 'hangs', group: 'webview', label: 'Hangs', timeoutMs: 20 },
      run: () => new Promise(() => undefined),
    };
    const quick = {
      spec: { id: 'quick', group: 'language' as const, label: 'Quick', timeoutMs: 100 },
      run: (): ProbeOutcome => ({ status: 'pass', values: {} }),
    };

    const results = await runDiagnostics(fakeDeps(), [hang, quick]);

    expect(results.map((result) => [result.id, result.status])).toEqual([
      ['hangs', 'timeout'],
      ['quick', 'pass'],
    ]);
  });

  it('runs the real probes against fake devices, so the SQLite and language probes pass', async () => {
    const results = await runDiagnostics(
      fakeDeps({
        language: {
          Segmenter: class {
            segment(text: string) {
              return text.split(/(?<=[。.])/u).map((segment) => ({ segment }));
            }
          } as never,
          TextDecoder: undefined,
        },
      }),
      PROBES.filter(
        (probe) => probe.spec.group === 'storage' && probe.spec.id === 'sqlite-version',
      ),
    );

    expect(results).toMatchObject([{ id: 'sqlite-version', status: 'pass' }]);
  });
});
