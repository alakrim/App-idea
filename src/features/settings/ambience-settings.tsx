import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Slider } from '@/ui/slider';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

import { formatDb } from './summaries';
import { SwitchCard, ValueHeading } from './setting-controls';
import { useSettings } from './settings-store';

export const AMBIENCE_LEVEL_RANGE = { min: -30, max: -14 } as const;
export const DUCKING_RANGE = { min: 0, max: 16 } as const;

/** Ambience beds: on or off, level and ducking. Sliders keep a local draft and save when released. */
export function AmbienceSettings() {
  const { settings, patch } = useSettings();
  const ambience = settings.ambience;
  const [level, setLevel] = useState(ambience.levelDb);
  const [ducking, setDucking] = useState(ambience.duckingDb);

  useEffect(() => setLevel(ambience.levelDb), [ambience.levelDb]);
  useEffect(() => setDucking(ambience.duckingDb), [ambience.duckingDb]);

  return (
    <>
      <Text variant="body" tone="muted">
        Soft background sounds follow the scene: rain at an inn, wind on a ridge. They sit under the
        narration and dip while someone speaks.
      </Text>

      <SwitchCard
        title="Play ambience"
        description="Background beds under the narration"
        value={ambience.enabled}
        onValueChange={(enabled) => patch({ ambience: { ...ambience, enabled } })}
      />

      <View style={styles.section}>
        <ValueHeading title="Level" value={formatDb(level)} />
        <Slider
          label="Ambience level"
          value={level}
          min={AMBIENCE_LEVEL_RANGE.min}
          max={AMBIENCE_LEVEL_RANGE.max}
          formatValue={formatDb}
          minimumLabel="Subtle"
          maximumLabel="Present"
          disabled={!ambience.enabled}
          onValueChange={setLevel}
          onValueCommit={(levelDb) => patch({ ambience: { ...ambience, levelDb } })}
        />
      </View>

      <View style={styles.section}>
        <ValueHeading title="Ducking" value={`${Math.round(ducking)} dB under voice`} />
        <Slider
          label="Ducking under voice"
          value={ducking}
          min={DUCKING_RANGE.min}
          max={DUCKING_RANGE.max}
          formatValue={(db) => `${Math.round(db)} decibels under voice`}
          minimumLabel="None"
          maximumLabel="Deep"
          disabled={!ambience.enabled}
          onValueChange={setDucking}
          onValueCommit={(duckingDb) => patch({ ambience: { ...ambience, duckingDb } })}
        />
      </View>

      <View style={styles.section}>
        <ValueHeading title="Sample" />
        <Card>
          <Button
            label="Play a sample"
            variant="secondary"
            disabled
            accessibilityHint="Available with the player"
          />
          <Text variant="caption" tone="muted">
            Available with the player. Play a chapter to hear the beds.
          </Text>
        </Card>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.sm,
  },
});
