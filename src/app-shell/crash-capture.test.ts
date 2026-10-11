import {
  createFatalErrorHandler,
  formatJsCrashReport,
  installJsCrashCapture,
  type ErrorUtilsLike,
  type JsErrorHandler,
} from './crash-capture';

const NOW = new Date('2026-10-11T12:00:00.000Z');

function fakeErrorUtils(
  initial?: JsErrorHandler,
): ErrorUtilsLike & { current: JsErrorHandler | undefined } {
  const state: { current: JsErrorHandler | undefined } = { current: initial };
  return {
    get current() {
      return state.current;
    },
    getGlobalHandler: () => state.current,
    setGlobalHandler: (handler) => {
      state.current = handler;
    },
  };
}

describe('createFatalErrorHandler', () => {
  it('writes a report for a fatal error, then delegates to the previous handler', () => {
    const calls: string[] = [];
    const writeReport = jest.fn((_report: string) => {
      calls.push('write');
    });
    const previous = jest.fn(() => calls.push('previous'));
    const handler = createFatalErrorHandler(previous, writeReport, () => NOW);
    const error = new TypeError('boom');

    handler(error, true);

    expect(writeReport).toHaveBeenCalledTimes(1);
    expect(writeReport.mock.calls[0]?.[0]).toContain('TypeError: boom');
    expect(previous).toHaveBeenCalledWith(error, true);
    expect(calls).toEqual(['write', 'previous']);
  });

  it('ignores a non-fatal error but still delegates to the previous handler', () => {
    const writeReport = jest.fn();
    const previous = jest.fn();
    const handler = createFatalErrorHandler(previous, writeReport, () => NOW);

    handler(new Error('soft'), false);
    handler(new Error('unknown'));

    expect(writeReport).not.toHaveBeenCalled();
    expect(previous).toHaveBeenCalledTimes(2);
  });

  it('never throws into React Native when the write fails, and still delegates', () => {
    const previous = jest.fn();
    const handler = createFatalErrorHandler(
      previous,
      () => {
        throw new Error('disk full');
      },
      () => NOW,
    );

    expect(() => handler(new Error('boom'), true)).not.toThrow();
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('never throws when the clock fails, and still delegates', () => {
    const previous = jest.fn();
    const writeReport = jest.fn();
    const handler = createFatalErrorHandler(previous, writeReport, () => {
      throw new Error('no clock');
    });

    expect(() => handler(new Error('boom'), true)).not.toThrow();
    expect(writeReport).not.toHaveBeenCalled();
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('runs without a previous handler', () => {
    const writeReport = jest.fn();
    const handler = createFatalErrorHandler(undefined, writeReport, () => NOW);

    expect(() => handler(new Error('boom'), true)).not.toThrow();
    expect(writeReport).toHaveBeenCalledTimes(1);
  });
});

describe('formatJsCrashReport', () => {
  it('records the kind, time, error name, message and stack', () => {
    const error = new RangeError('index out of range');
    error.stack = 'RangeError: index out of range\n    at render (app/index.tsx:10:4)';

    const report = formatJsCrashReport(error, NOW);

    expect(report.split('\n').slice(0, 4)).toEqual([
      'Lectio crash report',
      'Kind: JavaScript fatal error',
      'Time: 2026-10-11T12:00:00.000Z',
      '',
    ]);
    expect(report).toContain('RangeError: index out of range\nRangeError: index out of range');
    expect(report).toContain('    at render (app/index.tsx:10:4)');
  });

  it('appends the component stack when the error carries one', () => {
    const error = Object.assign(new Error('render failed'), {
      componentStack: '\n    in ChapterScreen\n    in Stack',
    });

    const report = formatJsCrashReport(error, NOW);

    expect(report).toContain('Component stack:\n\n    in ChapterScreen\n    in Stack');
  });

  it('omits the component stack section when there is none', () => {
    const report = formatJsCrashReport(new Error('plain'), NOW);

    expect(report).not.toContain('Component stack:');
  });

  it('describes a thrown string as itself', () => {
    expect(formatJsCrashReport('network down', NOW)).toContain('Thrown value: network down');
  });

  it('describes a thrown object as JSON', () => {
    expect(formatJsCrashReport({ code: 42 }, NOW)).toContain('Thrown value: {"code":42}');
  });

  it('survives a thrown value that cannot be serialised', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(formatJsCrashReport(circular, NOW)).toContain('Thrown value: [object]');
  });
});

describe('installJsCrashCapture', () => {
  it('replaces the global handler with one that captures fatal errors', () => {
    const previous = jest.fn();
    const writeReport = jest.fn();
    const errorUtils = fakeErrorUtils(previous);

    installJsCrashCapture({ errorUtils, writeReport, now: () => NOW });
    errorUtils.current?.(new Error('fatal'), true);

    expect(writeReport).toHaveBeenCalledTimes(1);
    expect(previous).toHaveBeenCalledWith(expect.any(Error), true);
  });

  it('does nothing when ErrorUtils is missing', () => {
    expect(() =>
      installJsCrashCapture({ errorUtils: undefined, writeReport: jest.fn() }),
    ).not.toThrow();
  });
});
