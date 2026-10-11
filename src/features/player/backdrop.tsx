import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { coverGradientFor } from '@/ui/cover-gradient';
import { useTheme } from '@/ui/theme';

import { PLAYER, withAlpha } from './layout';

export interface PlayerBackdropProps {
  /** Cover art to blur behind the player. Without it, a gradient stands in. */
  uri: string | null;
  title: string;
  /** The series colour, from its cover. */
  tint: string | null;
}

/** The cover, blurred and tinted, that fades into the background so the controls stay legible. */
export function PlayerBackdrop({ uri, title, tint }: PlayerBackdropProps) {
  const { colors } = useTheme();
  const fallback = coverGradientFor(title);
  const top = tint ?? fallback.from;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {uri ? (
        <Image source={{ uri }} contentFit="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <LinearGradient colors={[fallback.from, fallback.to]} style={StyleSheet.absoluteFill} />
      )}
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={[withAlpha(top, PLAYER.backdropTintAlpha), colors.bg]}
        locations={[0, 0.75]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
