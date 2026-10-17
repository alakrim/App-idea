import { StyleSheet, View } from 'react-native';

import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

import { useNow } from './use-now';
import { formatCountdown, remainingMs } from './waiting-state';

const COUNTDOWN_TICK_MS = 1_000;

export interface WaitingCardProps {
  /** When the chapter runs again, in epoch milliseconds. */
  retryAt: number;
  onRetryNow: () => void;
}

/** A chapter that waits for a connection: the countdown to its next try, and a way to try now. */
export function WaitingCard({ retryAt, onRetryNow }: WaitingCardProps) {
  const now = useNow(COUNTDOWN_TICK_MS);
  const countdown = formatCountdown(remainingMs(retryAt, now));
  return (
    <Card>
      <View style={styles.body}>
        <Text variant="body">{`Waiting for connection · retrying in ${countdown}`}</Text>
        <Button
          label="Retry now"
          variant="secondary"
          fullWidth
          onPress={onRetryNow}
          accessibilityHint="Tries this chapter again straight away."
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.md,
  },
});
