import { StyleSheet, View } from 'react-native';

import type { CueReport } from '@/core/analysis/cue-report';
import { CUE_DROP_REASONS, type CueDropReason } from '@/core/analysis/validate-cues';
import { useLiveRead } from '@/db/hooks';
import { ambienceReportRepo } from '@/db/repos/ambience-report-repo';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

import { ValueRow } from './value-row';

/** Plain names for the drop reasons, in the order the card lists them. */
const DROP_LABELS: Record<CueDropReason, string> = {
  malformed: 'Malformed',
  unknown_category: 'Unknown category',
  category_not_enabled: 'Not enabled in v1',
  low_confidence: 'Low confidence',
  invalid_span: 'Invalid span',
  too_short: 'Too short',
  merged: 'Merged into a neighbour',
  overlap_limit: 'Over the two-bed limit',
  density_cap: 'Over the density cap',
};

const REPORT_TABLES = ['ambience_reports'];

/** The cue report of the most recent analysis, across every chapter. Live: it updates after a run. */
export function LastAnalysisCard() {
  const latest = useLiveRead(ambienceReportRepo.latest, REPORT_TABLES, null);

  if (latest === null) {
    return (
      <Card>
        <Text variant="bodyStrong">No analysis yet</Text>
        <Text variant="caption" tone="muted">
          Analyse a chapter and its ambience report appears here.
        </Text>
      </Card>
    );
  }

  const { report } = latest;
  return (
    <Card>
      <View style={styles.rows}>
        <ValueRow label="Accepted cues" value={String(report.accepted)} />
        <ValueRow label="Coverage" value={coverageText(report)} />
        <ValueRow label="Fallback" value={report.fallbackRan ? 'Ran' : 'Not needed'} />
        <ValueRow label="Source" value={report.fromCache ? 'Cache, no cue call' : 'Model'} />
        {dropLines(report).map((line) => (
          <ValueRow key={line.key} label={line.key} value={line.text} />
        ))}
        <ValueRow label="Prompt" value={`${report.promptVersion} · ${report.model}`} />
        <ValueRow label="Analysed" value={new Date(report.createdAt).toISOString()} />
      </View>
    </Card>
  );
}

function coverageText(report: CueReport): string {
  return report.coveragePct === null ? 'No speech time' : `${report.coveragePct}% of narration`;
}

/** One line per drop reason that happened, or a single "None" line when nothing was dropped. */
function dropLines(report: CueReport): { key: string; text: string }[] {
  const lines = CUE_DROP_REASONS.filter((reason) => report.droppedByReason[reason] > 0).map(
    (reason) => ({
      key: `Dropped: ${DROP_LABELS[reason]}`,
      text: String(report.droppedByReason[reason]),
    }),
  );
  return lines.length > 0 ? lines : [{ key: 'Dropped', text: 'None' }];
}

const styles = StyleSheet.create({
  rows: {
    gap: space.sm,
  },
});
