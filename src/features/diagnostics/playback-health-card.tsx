import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { playbackHealth, usePlaybackHealthSummary } from '@/audio/playback-health';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

import { playbackHealthRows } from './playback-health-rows';
import { ValueRow } from './value-row';

/**
 * Narration health since the app started, over the last hour: boundary gaps, buffering, run-dry and
 * system pauses. The numbers are what a device test sends back, and Copy report includes them too.
 */
export function PlaybackHealthCard() {
  const summary = usePlaybackHealthSummary();

  // The observed span grows with time, so the summary is recomputed when the card opens.
  useEffect(() => {
    playbackHealth.refresh();
  }, []);

  return (
    <Card>
      <Text variant="caption" tone="muted">
        Recorded while narration plays. Send these numbers back after a device test.
      </Text>
      <View style={styles.rows}>
        {playbackHealthRows(summary).map((row) => (
          <ValueRow key={row.label} label={row.label} value={row.value} />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  rows: {
    gap: space.sm,
  },
});
