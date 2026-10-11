import { Check, Minus, X } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { ProgressRing } from '@/ui/progress-ring';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { hairline, iconStrokeWidth, radius, space } from '@/ui/tokens';

import { describeSteps, type StepState } from './stage-steps';

const NODE_SIZE = { full: 28, compact: 16 } as const;
const NODE_ICON = { full: 14, compact: 10 } as const;
const NODE_STROKE = { full: 3, compact: 2 } as const;

export interface StageStepperProps {
  steps: readonly StepState[];
  /** Full shows the step names under each node. Compact is the dot row used inside list rows. */
  variant?: 'full' | 'compact';
}

/** The stage stepper: Extract, Clean, Analyze, Translate, Narrate, with a live ring on the running step. */
export function StageStepper({ steps, variant = 'full' }: StageStepperProps) {
  const { colors } = useTheme();
  const size = NODE_SIZE[variant];

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={describeSteps(steps)}
      style={styles.row}
    >
      {steps.map((step, index) => {
        const previous = steps[index - 1];
        return (
          <View key={step.id} style={styles.column}>
            {previous ? (
              <View
                pointerEvents="none"
                style={[
                  styles.connector,
                  {
                    top: size / 2 - hairline,
                    height: hairline * 2,
                    backgroundColor: previous.status === 'done' ? colors.accent : colors.border,
                  },
                ]}
              />
            ) : null}
            <StepNode step={step} variant={variant} />
            {variant === 'full' ? (
              <Text
                variant="micro"
                tone={
                  step.status === 'failed'
                    ? 'danger'
                    : step.status === 'pending'
                      ? 'faint'
                      : 'muted'
                }
                align="center"
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
                style={styles.label}
              >
                {step.label}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

interface StepNodeProps {
  step: StepState;
  variant: 'full' | 'compact';
}

function StepNode({ step, variant }: StepNodeProps) {
  const { colors } = useTheme();
  const size = NODE_SIZE[variant];
  const icon = NODE_ICON[variant];
  const base = [styles.node, { width: size, height: size, borderRadius: radius.pill }];

  switch (step.status) {
    case 'done':
      return (
        <View style={[...base, { backgroundColor: colors.accent }]}>
          <Check size={icon} strokeWidth={iconStrokeWidth + 0.25} color={colors.onAccent} />
        </View>
      );
    case 'running':
      return (
        <ProgressRing
          progress={step.progress}
          label={`${step.label} in progress`}
          size={size}
          strokeWidth={NODE_STROKE[variant]}
        />
      );
    case 'failed':
      return (
        <View
          style={[
            ...base,
            {
              backgroundColor: colors.surfaceRaised,
              borderWidth: hairline,
              borderColor: colors.danger,
            },
          ]}
        >
          <X size={icon} strokeWidth={iconStrokeWidth + 0.25} color={colors.danger} />
        </View>
      );
    case 'skipped':
      return (
        <View style={[...base, { borderWidth: hairline, borderColor: colors.border }]}>
          <Minus size={icon} strokeWidth={iconStrokeWidth} color={colors.textFaint} />
        </View>
      );
    case 'pending':
      return (
        <View
          style={[
            ...base,
            { borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        />
      );
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: space.xs,
  },
  connector: {
    position: 'absolute',
    left: '-50%',
    right: '50%',
  },
  node: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    maxWidth: '100%',
  },
});
