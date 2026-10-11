import { StyleSheet, View } from 'react-native';

import { useOpenRouter } from '@/app-shell/openrouter-provider';
import { Button } from '@/ui/button';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

import { formatUsdPrecise } from './format';
import { useVoicePreview, type PreviewRequest } from './use-voice-preview';

export interface NarratorPreviewProps {
  request: PreviewRequest;
  /** The narrator's name, for the screen reader hint. */
  label: string;
}

/**
 * One narrator's sample. A cached clip plays at once. A new clip asks for the one-time consent to
 * spend credits, and then it is made, cached and played.
 */
export function NarratorPreview({ request, label }: NarratorPreviewProps) {
  const client = useOpenRouter();
  const preview = useVoicePreview(client);

  if (preview.phase === 'confirming' && preview.pending) {
    return (
      <View style={styles.stack}>
        <Text variant="caption" tone="muted">
          {`Previews use your OpenRouter credits, about ${formatUsdPrecise(preview.pending.estimateUsd)} each. You will only see this once.`}
        </Text>
        <View style={styles.row}>
          <View style={styles.grow}>
            <Button label="Play sample" onPress={preview.confirm} />
          </View>
          <View style={styles.grow}>
            <Button label="Not now" variant="ghost" onPress={preview.cancelConfirmation} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <Button
        label="Preview"
        variant="secondary"
        fullWidth
        loading={preview.phase === 'loading'}
        onPress={() => preview.preview(request)}
        accessibilityHint={`Plays a sample with the ${label} narrator`}
      />
      {preview.phase === 'error' && preview.message ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {preview.message}
        </Text>
      ) : null}
      {preview.isPlaying ? (
        <Text variant="caption" tone="accent" accessibilityLiveRegion="polite">
          Playing the sample…
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  grow: {
    flex: 1,
  },
});
