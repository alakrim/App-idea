import { router, Stack } from 'expo-router';

import { SeriesForm } from '@/features/series/series-form';
import { createSeries } from '@/features/series/series-service';
import { useSeriesDeps } from '@/features/series/use-series-deps';
import { Screen } from '@/ui/screen';

/** Forms bring their own gutter, so the screen adds none. */
const FLUSH = { paddingHorizontal: 0, paddingBottom: 0, gap: 0 } as const;

export default function NewSeriesScreen() {
  const deps = useSeriesDeps();

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'New series', presentation: 'modal' }} />
      <Screen edges={['bottom']} scrollable={false} contentStyle={FLUSH}>
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
