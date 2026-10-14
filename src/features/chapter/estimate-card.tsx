import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CostEstimate } from '@/features/pipeline/facade';
import { isEstimateUnknown } from '@/features/shared/estimate-price';
import { formatCostEstimate, formatUsd } from '@/features/shared/format';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { ChevronDown, ChevronUp } from '@/ui/icons';
import { Skeleton } from '@/ui/skeleton';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { hairline, iconSize, iconStrokeWidth, minTouchTarget, space } from '@/ui/tokens';

const STAGE_LABELS: Readonly<Record<string, string>> = {
  clean: 'Clean',
  analyze: 'Analyze',
  translate: 'Translate',
  narrate: 'Narrate',
};

export type EstimateStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; estimate: CostEstimate };

export interface EstimateCardProps {
  status: EstimateStatus;
  /** Recomputes the estimate. The error state offers it as Retry. */
  onRetry?: () => void;
}

/** The cost before anything is spent: a range, with the per-stage breakdown one tap away. */
export function EstimateCard({ status, onRetry }: EstimateCardProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  if (status.kind === 'idle') {
    return (
      <Card>
        <Text variant="caption" tone="muted">
          Add a source to see what it will cost before anything runs.
        </Text>
      </Card>
    );
  }

  if (status.kind === 'loading') {
    return (
      <Card accessibilityLabel="Estimating cost">
        <Skeleton height={space.xl + space.sm} width="60%" label="Estimating cost" />
        <Skeleton height={space.lg} width="85%" />
      </Card>
    );
  }

  if (status.kind === 'error') {
    return (
      <Card>
        <Text variant="micro" tone="muted">
          Estimated cost
        </Text>
        <Text variant="title">{"Couldn't work out the cost"}</Text>
        <Text variant="caption" tone="muted">
          Check your connection, then try again. Nothing has been spent.
        </Text>
        {onRetry ? <Button label="Retry" variant="secondary" fullWidth onPress={onRetry} /> : null}
      </Card>
    );
  }

  const { estimate } = status;
  if (isEstimateUnknown(estimate)) {
    return (
      <Card>
        <Text variant="micro" tone="muted">
          Estimated cost
        </Text>
        <Text variant="title">{"Can't price this right now"}</Text>
        <Text variant="caption" tone="muted">
          The price list for this model is not available. You can still create the chapter, and the
          cost stays unknown until it can be checked.
        </Text>
      </Card>
    );
  }
  return (
    <Card>
      <Text variant="micro" tone="muted">
        Estimated cost
      </Text>
      <Text
        variant="title"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Estimated cost ${formatCostEstimate(estimate)}`}
      >
        {formatCostEstimate(estimate)}
      </Text>
      <Text variant="caption" tone="muted">
        Billed to your own OpenRouter key. Nothing runs until you tap Create.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide cost breakdown' : 'Show cost breakdown'}
        onPress={() => setOpen((value) => !value)}
        style={styles.toggle}
      >
        <Text variant="caption" tone="accent">
          {open ? 'Hide breakdown' : 'Show breakdown'}
        </Text>
        {open ? (
          <ChevronUp size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.accent} />
        ) : (
          <ChevronDown size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.accent} />
        )}
      </Pressable>
      {open ? (
        <View style={styles.lines}>
          {estimate.lines.map((line, index) => (
            <View
              key={`${line.stage}-${index}`}
              style={[
                styles.line,
                index > 0 ? { borderTopWidth: hairline, borderTopColor: colors.border } : null,
              ]}
            >
              <View style={styles.lineCopy}>
                <Text variant="bodyStrong">{STAGE_LABELS[line.stage] ?? line.stage}</Text>
                <Text variant="caption" tone="muted">
                  {line.basis}
                </Text>
              </View>
              <Text variant="body">{line.usd === null ? 'Unknown' : formatUsd(line.usd)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: minTouchTarget,
    alignSelf: 'flex-start',
  },
  lines: {
    gap: space.xs,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.sm,
  },
  lineCopy: {
    flex: 1,
    gap: space.xxs,
  },
});
