/**
 * One diagnostics probe, run in isolation. A probe never throws out of `runProbe`: a crash becomes
 * an `error` result, and a probe that never settles becomes a `timeout`, so one bad probe cannot
 * stop the screen from showing the rest.
 */

export type ProbeGroup = 'language' | 'webview' | 'storage' | 'audio' | 'pipeline' | 'environment';

export type ProbeStatus = 'pass' | 'fail' | 'skipped' | 'timeout' | 'error';

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** What a probe body returns when it ran to the end. */
export interface ProbeOutcome {
  /** `skipped` means the probe cannot run here, with the reason in `message`. */
  status: 'pass' | 'fail' | 'skipped';
  values: Record<string, JsonValue>;
  message?: string;
}

export interface ProbeSpec {
  id: string;
  group: ProbeGroup;
  label: string;
  timeoutMs: number;
}

export interface ProbeResult {
  id: string;
  group: ProbeGroup;
  label: string;
  status: ProbeStatus;
  durationMs: number;
  values: Record<string, JsonValue>;
  message: string | null;
}

/** Runs one probe with its timeout. Never rejects. */
export async function runProbe(
  spec: ProbeSpec,
  run: () => ProbeOutcome | Promise<ProbeOutcome>,
): Promise<ProbeResult> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), spec.timeoutMs);
  });

  const settled = Promise.resolve()
    .then(run)
    .then(
      (outcome): ProbeResult => ({
        ...base(spec),
        status: outcome.status,
        values: outcome.values,
        message: outcome.message ?? null,
        durationMs: Date.now() - startedAt,
      }),
      (error: unknown): ProbeResult => ({
        ...base(spec),
        status: 'error',
        values: {},
        message: describeError(error),
        durationMs: Date.now() - startedAt,
      }),
    );

  try {
    const result = await Promise.race([settled, timeout]);
    if (result === 'timeout') {
      return {
        ...base(spec),
        status: 'timeout',
        values: {},
        message: `No result within ${spec.timeoutMs} ms.`,
        durationMs: Date.now() - startedAt,
      };
    }
    return result;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

function base(spec: ProbeSpec): Pick<ProbeResult, 'id' | 'group' | 'label'> {
  return { id: spec.id, group: spec.group, label: spec.label };
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}
