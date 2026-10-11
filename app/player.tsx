import { Stack, router } from 'expo-router';
import { X } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Badge } from '@/ui/badge';
import { CoverImage } from '@/ui/cover-image';
import { IconButton } from '@/ui/icon-button';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { gutter, playerCoverMaxWidth, space } from '@/ui/tokens';

export default function PlayerScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Screen edges={['top', 'bottom']} scrollable={false}>
        <View style={styles.close}>
          <IconButton label="Close player" icon={X} onPress={() => router.back()} />
        </View>
        <View style={styles.body}>
          <CoverImage uri={null} title="Nothing playing" style={styles.cover} />
          <View style={styles.meta}>
            <Badge label="Ambience off" />
            <Text variant="title" align="center" numberOfLines={2}>
              Nothing playing
            </Text>
            <Text variant="body" tone="muted" align="center">
              Pick a chapter from your library to start listening.
            </Text>
          </View>
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  close: {
    alignSelf: 'flex-end',
    paddingHorizontal: gutter,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.xl,
    paddingHorizontal: gutter,
  },
  cover: {
    width: '70%',
    maxWidth: playerCoverMaxWidth,
  },
  meta: {
    alignItems: 'center',
    gap: space.sm,
  },
});
