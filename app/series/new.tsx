import { router, Stack } from 'expo-router';

import { SeriesForm } from '@/features/series/series-form';
import { createSeries } from '@/features/series/series-service';
import { useSeriesDeps } from '@/features/series/use-series-deps';
import { Screen } from '@/ui/screen';

export default function NewSeriesScreen() {
  const deps = useSeriesDeps();

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'New series', presentation: 'modal' }} />
      <Screen edges={['bottom']} scrollable={false}>
        <SeriesForm
          initial={{
            title: '',
            coverUri: null,
            coverTint: null,
            sourceLang: null,
            targetLang: null,
          }}
          submitLabel="Create series"
          onSubmit={(values) => {
            const seriesId = createSeries(deps, values);
            router.replace({ pathname: '/series/[seriesId]', params: { seriesId } });
          }}
        />
      </Screen>
    </>
  );
}
