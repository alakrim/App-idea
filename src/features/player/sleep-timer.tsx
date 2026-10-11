import { Check, Moon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ListItem } from '@/ui/list-item';
import { Sheet } from '@/ui/sheet';
import { useTheme } from '@/ui/theme';
import { iconSize, iconStrokeWidth, space } from '@/ui/tokens';

import { Chip } from './chip';
import { formatClock } from './format';
import { usePlayback, usePlayerState } from './player-provider';

import type { SleepRequest } from './player-store';

const COUNTDOWN_TICK_MS = 1000;

const MINUTE_OPTIONS = [5, 15, 30, 45, 60] as const;

/** Re-renders once a second while `enabled`, so a countdown stays current. */
function useClock(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const handle = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(handle);
  }, [enabled]);
  return now;
}

/** The sleep timer chip. Shows the countdown while a timer is running. */
export function SleepChip({ onPress }: { onPress: () => void }) {
  const timer = usePlayerState((state) => state.sleepTimer);
  const running = timer.mode !== 'off';
  const now = useClock(timer.mode === 'minutes');

  let label = 'Sleep off';
  if (timer.mode === 'endOfChapter') label = 'Sleep at chapter end';
  if (timer.mode === 'minutes' && timer.endsAt !== null) {
    label = `Sleep in ${formatClock(Math.max(0, timer.endsAt - now))}`;
  }

  return (
    <Chip
      label={label}
      accessibilityLabel={running ? `${label}. Change sleep timer` : 'Sleep timer, off'}
      icon={Moon}
      active={running}
      onPress={onPress}
      testID="sleep-chip"
    />
  );
}

export interface SleepSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** Off, fixed minutes, or the end of the chapter. Picking one closes the sheet. */
export function SleepSheet({ visible, onClose }: SleepSheetProps) {
  const { colors } = useTheme();
  const { player } = usePlayback();
  const timer = usePlayerState((state) => state.sleepTimer);
  const now = useClock(timer.mode === 'minutes');

  const remainingMinutes =
    timer.mode === 'minutes' && timer.endsAt !== null
      ? Math.round(Math.max(0, timer.endsAt - now) / 60_000)
      : null;

  const choose = (request: SleepRequest) => {
    player.setSleepTimer(request);
    onClose();
  };

  const rows: { key: string; title: string; request: SleepRequest; selected: boolean }[] = [
    { key: 'off', title: 'Off', request: { mode: 'off' }, selected: timer.mode === 'off' },
    ...MINUTE_OPTIONS.map((minutes) => ({
      key: `${minutes}`,
      title: `${minutes} minutes`,
      request: { mode: 'minutes', minutes } as SleepRequest,
      selected: remainingMinutes === minutes,
    })),
    {
      key: 'chapter',
      title: 'End of chapter',
      request: { mode: 'endOfChapter' },
      selected: timer.mode === 'endOfChapter',
    },
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title="Sleep timer" snapPoints={['68%']}>
      <View style={styles.list}>
        {rows.map((row) => (
          <ListItem
            key={row.key}
            title={row.title}
            onPress={() => choose(row.request)}
            accessibilityHint={row.selected ? 'Selected' : undefined}
            trailing={
              row.selected ? (
                <Check size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.accent} />
              ) : null
            }
          />
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: space.xs,
  },
});
