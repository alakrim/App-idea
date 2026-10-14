import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeInUp,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSettings } from '@/features/settings/settings-store';
import { Button } from '@/ui/button';
import { IconButton } from '@/ui/icon-button';
import { BookOpen, ChevronLeft, Send, ShieldCheck } from '@/ui/icons';
import type { LucideIcon } from '@/ui/icons';
import { useMotion } from '@/ui/motion';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import {
  durations,
  gutter,
  hairline,
  iconSize,
  iconStrokeWidth,
  minTouchTarget,
  radius,
  space,
} from '@/ui/tokens';

import { ConnectStep } from './connect-step';
import { NarratorStep } from './narrator-step';
import { WelcomeIllustration } from './welcome-illustration';

const STEP_COUNT = 4;
type StepIndex = 0 | 1 | 2 | 3;

export interface OnboardingFlowProps {
  /** Called after the notice is accepted and onboarding is saved as done. */
  onFinish: () => void;
}

/**
 * First-run onboarding: value, key, narrator, notice. Only the notice is required. Saving the notice
 * marks onboarding done, which is what the tab layout checks before showing the app.
 */
export function OnboardingFlow({ onFinish }: OnboardingFlowProps) {
  const { colors } = useTheme();
  const { patch } = useSettings();
  const { reduced } = useMotion();
  const [step, setStep] = useState<StepIndex>(0);

  const next = () =>
    setStep((current) => (current < STEP_COUNT - 1 ? ((current + 1) as StepIndex) : current));
  const back = () => setStep((current) => (current > 0 ? ((current - 1) as StepIndex) : current));

  // The notice is read before any key is asked for. Accepting it is saved at once.
  const accept = () => {
    patch({ contentNoticeAccepted: true });
    next();
  };
  const finish = () => {
    patch({ onboardingDone: true });
    onFinish();
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.bar}>
        {step > 0 ? (
          <IconButton label="Back" icon={ChevronLeft} onPress={back} />
        ) : (
          <View style={styles.barSpacer} />
        )}
        <Button label="Skip setup" variant="ghost" onPress={finish} />
      </View>

      <StepProgress step={step} />

      <Animated.View
        key={step}
        entering={reduced ? undefined : FadeInUp.duration(durations.emphasized)}
        exiting={reduced ? undefined : FadeOut.duration(durations.micro)}
        style={styles.body}
      >
        {step === 0 ? <ValueStep onNext={next} /> : null}
        {step === 1 ? <NoticeStep onAccept={accept} /> : null}
        {step === 2 ? <ConnectStep onDone={next} onSkip={next} /> : null}
        {step === 3 ? <NarratorStep onDone={finish} /> : null}
      </Animated.View>
    </SafeAreaView>
  );
}

function StepProgress({ step }: { step: StepIndex }) {
  const { colors } = useTheme();
  const { springTo } = useMotion();
  const fraction = useSharedValue((step + 1) / STEP_COUNT);

  useEffect(() => {
    fraction.value = springTo((step + 1) / STEP_COUNT, 'gentle');
  }, [step, fraction, springTo]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fraction.value * 100}%` }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step + 1} of ${STEP_COUNT}`}
      accessibilityValue={{ min: 1, max: STEP_COUNT, now: step + 1 }}
      style={[styles.progressTrack, { backgroundColor: colors.border }]}
    >
      <Animated.View style={[styles.progressFill, { backgroundColor: colors.accent }, fillStyle]} />
    </View>
  );
}

function ValueStep({ onNext }: { onNext: () => void }) {
  return (
    <View style={styles.step}>
      <View style={styles.hero}>
        <WelcomeIllustration />
      </View>
      <View style={styles.copy}>
        <Text variant="display" accessibilityRole="header">
          Any page, read to you.
        </Text>
        <Text variant="body" tone="muted">
          Paste a link or open a PDF. Lectio keeps the main text, drops the clutter and narrates it
          like an audiobook.
        </Text>
      </View>
      <View style={styles.footer}>
        <Button label="Continue" size="lg" fullWidth onPress={onNext} />
      </View>
    </View>
  );
}

const NOTICE_POINTS: readonly { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ShieldCheck,
    title: 'Your key stays on this device',
    body: 'It is kept in secure storage and sent only to OpenRouter.',
  },
  {
    icon: Send,
    title: 'Text goes to the models you choose',
    body: 'Imported text is sent to the translation, analysis and voice models you pick.',
  },
  {
    icon: BookOpen,
    title: 'Import only what you may read',
    body: 'Use Lectio for your own files, public pages and material you are licensed to use.',
  },
];

function NoticeStep({ onAccept }: { onAccept: () => void }) {
  const { colors } = useTheme();

  return (
    <View style={styles.step}>
      <View style={styles.copy}>
        <Text variant="title" accessibilityRole="header">
          Before you import
        </Text>
        <Text variant="body" tone="muted">
          Please read this once. It covers what happens to the text you bring into Lectio.
        </Text>
      </View>
      <View style={styles.points}>
        {NOTICE_POINTS.map((point) => {
          const Icon = point.icon;
          return (
            <View key={point.title} style={[styles.point, { borderColor: colors.border }]}>
              <View style={[styles.pointIcon, { backgroundColor: colors.accentSoft }]}>
                <Icon size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.accent} />
              </View>
              <View style={styles.pointCopy}>
                <Text variant="bodyStrong">{point.title}</Text>
                <Text variant="caption" tone="muted">
                  {point.body}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.footer}>
        <Button label="I understand" size="lg" fullWidth onPress={onAccept} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
  },
  barSpacer: {
    width: minTouchTarget,
    height: minTouchTarget,
  },
  progressTrack: {
    height: space.xxs,
    marginHorizontal: gutter,
    marginTop: space.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: space.xxs,
    borderRadius: radius.pill,
  },
  body: {
    flex: 1,
  },
  step: {
    flex: 1,
    paddingHorizontal: gutter,
    paddingTop: space.xxl,
    paddingBottom: space.xl,
    gap: space.xl,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
  },
  copy: {
    gap: space.md,
  },
  points: {
    gap: space.sm,
  },
  point: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
  pointIcon: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointCopy: {
    flex: 1,
    gap: space.xxs,
  },
  footer: {
    marginTop: 'auto',
    gap: space.xs,
  },
});
