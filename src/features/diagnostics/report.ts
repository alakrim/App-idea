import type { EnvironmentInfo } from './environment';
import type { ProbeResult, ProbeStatus } from './probe';

export const REPORT_SCHEMA = 'lectio.diagnostics';
export const REPORT_VERSION = 1;

export interface DiagnosticsReport {
  schema: typeof REPORT_SCHEMA;
  version: typeof REPORT_VERSION;
  generatedAt: string;
  environment: EnvironmentInfo;
  summary: Record<ProbeStatus, number> & { total: number };
  probes: ProbeResult[];
}

/** Counts each status, so the report opens with a summary a reader can scan. */
export function summarize(results: readonly ProbeResult[]): DiagnosticsReport['summary'] {
  const summary = { pass: 0, fail: 0, skipped: 0, timeout: 0, error: 0, total: results.length };
  for (const result of results) summary[result.status] += 1;
  return summary;
}

export function buildReport(
  results: readonly ProbeResult[],
  environment: EnvironmentInfo,
  generatedAt: Date,
): DiagnosticsReport {
  return {
    schema: REPORT_SCHEMA,
    version: REPORT_VERSION,
    generatedAt: generatedAt.toISOString(),
    environment,
    summary: summarize(results),
    probes: [...results],
  };
}

/** The text that goes to the clipboard: pretty JSON, so it reads well when pasted into a message. */
export function reportToJson(report: DiagnosticsReport): string {
  return JSON.stringify(report, null, 2);
}
