import { StyleSheet, View } from 'react-native';

import type { SourcePreview } from '@/features/pipeline/facade';
import { formatWordCount } from '@/features/shared/format';
import { nativeLanguageName } from '@/features/shared/languages';
import { Badge, type BadgeTone } from '@/ui/badge';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

const QUALITY: Readonly<Record<SourcePreview['quality'], { label: string; tone: BadgeTone }>> = {
  good: { label: 'Clean', tone: 'success' },
  needs_ai: { label: 'AI cleanup', tone: 'accent' },
  needs_render: { label: 'Needs page render', tone: 'warning' },
  empty: { label: 'No text found', tone: 'danger' },
};

export interface SourcePreviewCardProps {
  preview: SourcePreview;
}

/** What the link yielded: an excerpt in Literata, the size, the language and how clean it is. */
export function SourcePreviewCard({ preview }: SourcePreviewCardProps) {
  const quality = QUALITY[preview.quality];
  return (
    <Card>
      <View style={styles.meta}>
        <Badge label={quality.label} tone={quality.tone} />
        <Text variant="caption" tone="muted">
          {formatWordCount(preview.wordCount)}
        </Text>
        {preview.detectedLang ? (
          <Text variant="caption" tone="muted">
            {nativeLanguageName(preview.detectedLang)}
          </Text>
        ) : null}
      </View>
      {preview.excerpt !== '' ? (
        <Text
          variant="reading"
          numberOfLines={6}
          accessibilityLabel={`Excerpt: ${preview.excerpt}`}
        >
          {preview.excerpt}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
  },
});
