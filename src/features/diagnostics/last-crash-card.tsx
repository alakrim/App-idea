import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { readLastCrashReport, type StoredCrashReport } from '@/app-shell/crash-store';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { useToast } from '@/ui/toast';
import { space } from '@/ui/tokens';

/** Lines shown on screen. The copy action always takes the whole report. */
const PREVIEW_LINES = 40;

/** There is no monospace token yet, so the crash preview picks the platform's system mono font. */
const MONO_FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

/** The most recent crash report, so a user can send it on after the app closed unexpectedly. */
export function LastCrashCard() {
  const toast = useToast();
  const [report] = useState<StoredCrashReport | null>(() => readLastCrashReport());

  if (report === null) {
    return (
      <Card>
        <Text variant="bodyStrong">No crash recorded</Text>
        <Text variant="caption" tone="muted">
          If Lectio closes unexpectedly, the report appears here on the next launch.
        </Text>
      </Card>
    );
  }

  const copy = () => {
    void Clipboard.setStringAsync(report.text).then(() =>
      toast.show({ message: 'Crash report copied', tone: 'success' }),
    );
  };

  return (
    <Card>
      <Text variant="caption" tone="muted">
        {report.kept === 'current'
          ? 'Not yet shown on launch. Copy it and send it to us.'
          : 'From the last crash. Copy it and send it to us.'}
      </Text>
      <View style={styles.preview} accessibilityLabel="Crash report preview">
        <Text variant="caption" selectable style={styles.previewText}>
          {previewLines(report.text)}
        </Text>
      </View>
      <Button label="Copy crash report" fullWidth onPress={copy} />
    </Card>
  );
}

/** The first lines of the report, as a block of text for the preview. */
function previewLines(text: string): string {
  return text.split('\n').slice(0, PREVIEW_LINES).join('\n');
}

const styles = StyleSheet.create({
  preview: {
    gap: space.xs,
  },
  previewText: {
    fontFamily: MONO_FONT,
  },
});
