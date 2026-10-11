import { buildReport, reportToJson, REPORT_SCHEMA, REPORT_VERSION, summarize } from './report';

import type { EnvironmentInfo } from './environment';
import type { ProbeResult } from './probe';

const ENVIRONMENT: EnvironmentInfo = {
  appVersion: '0.1.0',
  gitSha: 'abc1234',
  reactNative: '0.86.3',
  expo: '57.0.27',
  platform: 'android',
  osVersion: '15 · API 35',
  deviceModel: 'Google Pixel 8',
  hermes: true,
  dev: false,
};

function result(id: string, status: ProbeResult['status']): ProbeResult {
  return {
    id,
    group: 'language',
    label: id,
    status,
    durationMs: 3,
    values: { id },
    message: status === 'pass' ? null : 'why',
  };
}

describe('diagnostics report', () => {
  const results = [result('a', 'pass'), result('b', 'fail'), result('c', 'timeout'), result('d', 'pass')];

  it('counts every status and the total', () => {
    expect(summarize(results)).toEqual({
      pass: 2,
      fail: 1,
      skipped: 0,
      timeout: 1,
      error: 0,
      total: 4,
    });
  });

  it('builds a report with its schema, version, time, environment, summary and probes', () => {
    const report = buildReport(results, ENVIRONMENT, new Date('2026-10-11T12:00:00.000Z'));

    expect(report).toEqual({
      schema: REPORT_SCHEMA,
      version: REPORT_VERSION,
      generatedAt: '2026-10-11T12:00:00.000Z',
      environment: ENVIRONMENT,
      summary: { pass: 2, fail: 1, skipped: 0, timeout: 1, error: 0, total: 4 },
      probes: results,
    });
  });

  it('serialises to pretty JSON that parses back to the same report', () => {
    const report = buildReport(results, ENVIRONMENT, new Date('2026-10-11T12:00:00.000Z'));
    const text = reportToJson(report);

    expect(text).toContain('\n  "schema": "lectio.diagnostics"');
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(report)));
  });
});
