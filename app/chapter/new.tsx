import { Stack, useLocalSearchParams, router } from 'expo-router';

import { AddChapterScreen } from '@/features/chapter/add-chapter-screen';
import { ErrorState } from '@/ui/error-state';
import { Screen } from '@/ui/screen';

/** Forms bring their own gutter, so the screen adds none. */
const FLUSH = { paddingHorizontal: 0, paddingBottom: 0, gap: 0 } as const;

export default function NewChapterScreen() {
  const { seriesId } = useLocalSearchParams<{ seriesId?: string }>();

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'New chapter', presentation: 'modal' }} />
      <Screen edges={['bottom']} scrollable={false} contentStyle={FLUSH}>
        {seriesId ? (
          <AddChapterScreen seriesId={seriesId} />
        ) : (
          <ErrorState
            title="No series selected"
            message="Open this from a series so the chapter has somewhere to go."
            onRetry={() => router.back()}
            retryLabel="Go back"
          />
        )}
      </Screen>
    </>
  );
}
