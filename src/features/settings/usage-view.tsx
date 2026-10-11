import { CircleDollarSign } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/ui/card';
import { EmptyState } from '@/ui/empty-state';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { hairline, radius, space } from '@/ui/tokens';

import { formatUsdPrecise } from './format';

import type { UsageShare, UsageSummary, UsageWindow } from './usage';

const WINDOW_LABELS: Readonly<Record<UsageWindow['id'], string>> = {
  today: 'Today',
  week: '7 days',
  month: '30 days',
};

export function callsLabel(calls: number): string {
  return calls === 1 ? '1 call' : `${calls} calls`;
}

/** Spend by window, model and stage. Shares are drawn as bars, with no chart library. */
export function UsageView({ summary }: { summary: UsageSummary }) {
  const anySpend = summary.windows.some((window) => window.calls > 0);

  if (!anySpend) {
    return (
      <EmptyState
        icon={CircleDollarSign}
        title="No spending yet"
        description="Costs appear here after your first translation, analysis or narration."
      />
    );
  }

  return (
    <>
      <View style={styles.windows}>
        {summary.windows.map((window) => (
          <WindowCard key={window.id} window={window} />
        ))}
      </View>
      <BreakdownSection title="By model" subtitle="Last 30 days" rows={summary.byModel} />
      <BreakdownSection title="By stage" subtitle="Last 30 days" rows={summary.byStage} />
      <Text variant="caption" tone="faint">
        Amounts come from the usage OpenRouter reports for each call, or an estimate when it reports
        none. Your OpenRouter dashboard has the bill.
      </Text>
    </>
  );
}

function WindowCard({ window }: { window: UsageWindow }) {
  return (
    <Card style={styles.windowCard}>
      <Text variant="micro" tone="faint">
        {WINDOW_LABELS[window.id]}
      </Text>
      <Text
        variant="heading"
        accessibilityLabel={`${WINDOW_LABELS[window.id]}: ${formatUsdPrecise(window.costUsd)}`}
      >
        {formatUsdPrecise(window.costUsd)}
      </Text>
      <Text variant="caption" tone="muted">
        {callsLabel(window.calls)}
      </Text>
    </Card>
  );
}

function BreakdownSection({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: readonly UsageShare[];
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text variant="micro" tone="faint" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="caption" tone="faint">
          {subtitle}
        </Text>
      </View>
      {rows.length === 0 ? (
        <Card>
          <Text variant="caption" tone="muted">
            Nothing spent in this period.
          </Text>
        </Card>
      ) : (
        <Card style={styles.breakdown}>
          {rows.map((row) => (
            <BreakdownRow key={row.key} row={row} />
          ))}
        </Card>
      )}
    </View>
  );
}

function BreakdownRow({ row }: { row: UsageShare }) {
  const { colors } = useTheme();
  const percent = Math.round(row.share * 100);
  return (
    <View
      accessible
      accessibilityLabel={`${row.label}: ${formatUsdPrecise(row.costUsd)}, ${callsLabel(row.calls)}, ${percent} percent of spend`}
      style={styles.row}
    >
      <View style={styles.rowLine}>
        <Text variant="bodyStrong" numberOfLines={1} style={styles.rowLabel}>
          {row.label}
        </Text>
        <Text variant="caption" tone="muted">
          {formatUsdPrecise(row.costUsd)}
        </Text>
      </View>
      <View
        style={[
          styles.track,
          { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        ]}
      >
        <View style={[styles.fill, { backgroundColor: colors.accent, width: `${percent}%` }]} />
      </View>
      <Text variant="caption" tone="faint">
        {callsLabel(row.calls)}
      </Text>
    </View>
  );
}

const TRACK_HEIGHT = space.xs;

const styles = StyleSheet.create({
  windows: {
    flexDirection: 'row',
    gap: space.sm,
  },
  windowCard: {
    flex: 1,
    padding: space.md,
    gap: space.xxs,
  },
  section: {
    gap: space.sm,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  breakdown: {
    gap: space.lg,
  },
  row: {
    gap: space.xs,
  },
  rowLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  rowLabel: {
    flex: 1,
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  fill: {
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
  },
});
