import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BED_LEVEL_RANGE_DB, DUCKING_RANGE_DB } from '@/core/playback/ranges';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Slider } from '@/ui/slider';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

import { SwitchCard, ValueHeading } from './setting-controls';
import { useSettings } from './settings-store';
import { formatDb } from './summaries';

export interface AmbienceSettingsProps {
  /** Plays the sample bed at the given level. Omitted, the sample is not offered. */
  onPlaySample?: (levelDb: number) => void;
}

/** Ambience beds: on or off, level and ducking. Sliders keep a local draft and save when released. */
export function AmbienceSettings({ onPlaySample }: AmbienceSettingsProps) {
  const { settings, patch } = useSettings();
  const ambience = settings.ambience;
  // While a slider is dragged it shows its draft. The saved value is written once, on release.
  const [dragLevel, setDragLevel] = useState<number | null>(null);
  const [dragDucking, setDragDucking] = useState<number | null>(null);
  const level = dragLevel ?? ambience.levelDb;
  const ducking = dragDucking ?? ambience.duckingDb;

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
          min={BED_LEVEL_RANGE_DB.min}
          max={BED_LEVEL_RANGE_DB.max}
          formatValue={formatDb}
          minimumLabel="Subtle"
          maximumLabel="Present"
          disabled={!ambience.enabled}
          onValueChange={setDragLevel}
          onValueCommit={(levelDb) => {
            setDragLevel(null);
            patch({ ambience: { ...ambience, levelDb } });
          }}
        />
      </View>

      <View style={styles.section}>
        <ValueHeading title="Ducking" value={`${Math.round(ducking)} dB under voice`} />
        <Slider
          label="Ducking under voice"
          value={ducking}
          min={DUCKING_RANGE_DB.min}
          max={DUCKING_RANGE_DB.max}
          formatValue={(db) => `${Math.round(db)} decibels under voice`}
          minimumLabel="None"
          maximumLabel="Deep"
          disabled={!ambience.enabled}
          onValueChange={setDragDucking}
          onValueCommit={(duckingDb) => {
            setDragDucking(null);
            patch({ ambience: { ...ambience, duckingDb } });
          }}
        />
      </View>

      <View style={styles.section}>
        <ValueHeading title="Sample" />
        <Card>
          <Button
            label="Play a sample"
            variant="secondary"
            fullWidth
            disabled={!ambience.enabled || onPlaySample === undefined}
            onPress={() => onPlaySample?.(ambience.levelDb)}
            accessibilityHint="Plays rain for eight seconds at the level you set"
          />
          <Text variant="caption" tone="muted">
            {ambience.enabled
              ? 'Plays rain for eight seconds at the level you set.'
              : 'Turn ambience on to hear a sample.'}
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
