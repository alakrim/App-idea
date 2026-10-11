import { router, Stack, useLocalSearchParams } from 'expo-router';

import { useSeries } from '@/db/hooks';
import { SeriesForm } from '@/features/series/series-form';
import { updateSeries } from '@/features/series/series-service';
import { useSeriesDeps } from '@/features/series/use-series-deps';
import { ErrorState } from '@/ui/error-state';
import { Screen } from '@/ui/screen';

/** Forms bring their own gutter, so the screen adds none. */
const FLUSH = { paddingHorizontal: 0, paddingBottom: 0, gap: 0 } as const;

export default function EditSeriesScreen() {
  const { seriesId } = useLocalSearchParams<{ seriesId: string }>();
  const series = useSeries(seriesId);
  const deps = useSeriesDeps();

  if (series === null) {
    return (
      <>
        <Stack.Screen
          options={{ headerShown: true, title: 'Edit series', presentation: 'modal' }}
        />
        <Screen edges={['bottom']} scrollable={false} contentStyle={FLUSH}>
          <ErrorState
            title="Series not found"
            message="It may have been deleted."
            retryLabel="Go back"
            onRetry={() => router.back()}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Edit series', presentation: 'modal' }} />
      <Screen edges={['bottom']} scrollable={false} contentStyle={FLUSH}>
        <SeriesForm
          key={series.id}
          initial={{
            title: series.title,
            coverUri: series.coverUri,
            coverTint: series.coverTint,
            sourceLang: series.sourceLang,
            targetLang: series.targetLang,
          }}
          submitLabel="Save changes"
          onSubmit={(values) => {
            updateSeries(deps, series.id, values);
            router.back();
          }}
        />
      </Screen>
    </>
  );
}
