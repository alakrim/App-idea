import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { playbackHealth } from '@/audio/playback-health';
import { useDb } from '@/db/hooks';
import { SettingsPage } from '@/features/settings/settings-page';
import { SettingsSection } from '@/features/settings/settings-section';
import { Badge, type BadgeTone } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { useToast } from '@/ui/toast';
import { space } from '@/ui/tokens';

import { useBridgeProbe } from './bridge-probe';
import { deviceDiagnosticsDeps } from './device-deps';
import { readEnvironment, type EnvironmentInfo } from './environment';
import { resultHeadline, valueLines } from './format';
import { LastAnalysisCard } from './last-analysis-card';
import { LastCrashCard } from './last-crash-card';
import { PlaybackHealthCard } from './playback-health-card';
import { RECENT_CHAPTERS_PROBE_ID } from './recent-chapters';
import { RecentChaptersSection } from './recent-chapters-section';
import { buildReport, reportToJson, summarize } from './report';
import { PROBES, runDiagnostics } from './run-all';
import { ValueRow } from './value-row';

import type { ProbeResult, ProbeStatus } from './probe';

const STATUS_BADGE: Record<ProbeStatus, { label: string; tone: BadgeTone }> = {
  pass: { label: 'Pass', tone: 'success' },
  fail: { label: 'Fail', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'neutral' },
  timeout: { label: 'Timed out', tone: 'warning' },
  error: { label: 'Error', tone: 'danger' },
};

/** The diagnostics screen. It runs every probe, shows each result with its values, and copies a JSON report. */
export function DiagnosticsScreen() {
  const db = useDb();
  const toast = useToast();
  const { send, host } = useBridgeProbe();
  const [results, setResults] = useState<ProbeResult[]>([]);
  // Starts true: the probes run as soon as the screen opens.
  const [running, setRunning] = useState(true);
  const [environment] = useState<EnvironmentInfo>(() => readEnvironment());
  const runId = useRef(0);

  // Only asynchronous work happens here, so it is safe to call from an effect. Each run has an id,
  // so a run that outlives a newer one cannot write its results over the newer run.
  const execute = useCallback(() => {
    runId.current += 1;
    const current = runId.current;
    void runDiagnostics(deviceDiagnosticsDeps(db, { send }), PROBES, (result) => {
      if (runId.current === current) setResults((previous) => [...previous, result]);
    })
      .catch(() => undefined)
      .finally(() => {
        if (runId.current === current) setRunning(false);
      });
  }, [db, send]);

  useEffect(() => {
    execute();
  }, [execute]);

  const runAgain = () => {
    setRunning(true);
    setResults([]);
    execute();
  };

  const summary = useMemo(() => summarize(results), [results]);

  const copy = () => {
    const report = buildReport(results, environment, new Date(), playbackHealth.summary());
    void Clipboard.setStringAsync(reportToJson(report)).then(() =>
      toast.show({ message: 'Report copied', tone: 'success' }),
    );
  };

  return (
    <SettingsPage title="Diagnostics">
      <SettingsSection title="Device">
        <Card>
          <ValueRow label="App" value={`${environment.appVersion} (${environment.gitSha})`} />
          <ValueRow label="React Native" value={environment.reactNative} />
          <ValueRow label="Expo" value={environment.expo ?? 'unknown'} />
          <ValueRow label="Hermes" value={environment.hermes ? 'on' : 'off'} />
          <ValueRow label="Platform" value={`${environment.platform} ${environment.osVersion}`} />
          <ValueRow label="Model" value={environment.deviceModel ?? 'unknown'} />
        </Card>
      </SettingsSection>

      <SettingsSection title="Last crash">
        <LastCrashCard />
      </SettingsSection>

      <SettingsSection title="Last analysis">
        <LastAnalysisCard />
      </SettingsSection>

      <SettingsSection title="Playback health">
        <PlaybackHealthCard />
      </SettingsSection>

      <View style={styles.actions}>
        <Button
          label={running ? 'Running…' : 'Run again'}
          variant="secondary"
          disabled={running}
          fullWidth
          onPress={runAgain}
        />
        <Button label="Copy report" fullWidth disabled={results.length === 0} onPress={copy} />
      </View>

      <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
        {`${summary.pass} pass · ${summary.fail} fail · ${summary.skipped} skipped · ${summary.timeout + summary.error} stopped`}
      </Text>

      {PROBES.map((probe) => {
        const result = results.find((entry) => entry.id === probe.spec.id) ?? null;
        if (probe.spec.id === RECENT_CHAPTERS_PROBE_ID && result?.status === 'pass') {
          return <RecentChaptersSection key={probe.spec.id} result={result} />;
        }
        return <ProbeRow key={probe.spec.id} label={probe.spec.label} result={result} />;
      })}

      {host}
    </SettingsPage>
  );
}

function ProbeRow({ label, result }: { label: string; result: ProbeResult | null }) {
  if (result === null) {
    return (
      <Card>
        <Text variant="bodyStrong">{label}</Text>
        <Text variant="caption" tone="faint">
          Waiting
        </Text>
      </Card>
    );
  }
  const badge = STATUS_BADGE[result.status];
  const headline = resultHeadline(result);
  return (
    <Card>
      <View style={styles.probeHead}>
        <Text variant="bodyStrong" style={styles.probeTitle}>
          {label}
        </Text>
        <Badge label={badge.label} tone={badge.tone} />
      </View>
      {headline ? (
        <Text variant="caption" tone="muted">
          {headline}
        </Text>
      ) : null}
      {valueLines(result.values).map((line) => (
        <ValueRow key={line.key} label={line.key} value={line.text} />
      ))}
      <Text variant="caption" tone="faint">
        {`${result.durationMs} ms`}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: space.sm,
  },
  probeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  probeTitle: {
    flex: 1,
  },
});
