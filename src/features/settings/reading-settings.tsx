import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/ui/card';
import { Slider } from '@/ui/slider';
import { Text } from '@/ui/text';
import { typography, space } from '@/ui/tokens';

import { formatPercent } from './format';
import { ValueHeading } from './setting-controls';
import { useSettings } from './settings-store';

export const FONT_SCALE_RANGE = { min: 0.8, max: 1.6, step: 0.05 } as const;

const PREVIEW_TEXT =
  'The lamp burned low, and the story began to breathe again. Every page turned a little slower than the one before.';

/** Reading text size with a live preview in the reading face (Literata). */
export function ReadingSettings() {
  const { settings, patch } = useSettings();
  // The slider shows its draft while dragged. The saved size is written once, on release.
  const [dragScale, setDragScale] = useState<number | null>(null);
  const scale = dragScale ?? settings.reading.fontScale;

  return (
    <>
      <View style={styles.section}>
        <ValueHeading title="Text size" value={formatPercent(scale)} />
        <Slider
          label="Reading text size"
          value={scale}
          min={FONT_SCALE_RANGE.min}
          max={FONT_SCALE_RANGE.max}
          step={FONT_SCALE_RANGE.step}
          formatValue={(next) => `${formatPercent(next)} of the standard size`}
          minimumLabel="Smaller"
          maximumLabel="Larger"
          onValueChange={setDragScale}
          onValueCommit={(fontScale) => {
            setDragScale(null);
            patch({ reading: { ...settings.reading, fontScale } });
          }}
        />
      </View>

      <View style={styles.section}>
        <ValueHeading title="Preview" />
        <Card>
          <Text
            variant="reading"
            style={{
              fontSize: typography.reading.size * scale,
              lineHeight: typography.reading.lineHeight * scale,
            }}
          >
            {PREVIEW_TEXT}
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
