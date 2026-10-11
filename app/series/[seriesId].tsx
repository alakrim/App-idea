import { Stack, useLocalSearchParams } from 'expo-router';

import { SeriesScreen } from '@/features/series/series-screen';

export default function SeriesRoute() {
  const { seriesId } = useLocalSearchParams<{ seriesId: string }>();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SeriesScreen seriesId={seriesId} />
    </>
  );
}
