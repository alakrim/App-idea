import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { coverGradientFor, monogramFor } from './cover-gradient';
import { Text } from './text';
import {
  coverMonogramColor,
  coverMonogramLineRatio,
  coverMonogramRatio,
  durations,
  radius,
} from './tokens';

export interface CoverImageProps {
  /** Null, or a load error, shows the generated gradient monogram. */
  uri: string | null;
  /** Title drives the monogram and the accessible name. */
  title: string;
  blurhash?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Cover art at 2:3 with a blurhash placeholder, or a deterministic gradient when there is none. */
export function CoverImage({ uri, title, blurhash, style, testID }: CoverImageProps) {
  const [failed, setFailed] = useState(false);
  const showArt = uri !== null && !failed;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Cover of ${title}`}
      testID={testID}
      style={[styles.frame, style]}
    >
      {showArt ? (
        <Image
          source={{ uri }}
          placeholder={blurhash ? { blurhash } : undefined}
          contentFit="cover"
          transition={durations.standard}
          onError={() => setFailed(true)}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <Monogram title={title} />
      )}
    </View>
  );
}

function Monogram({ title }: { title: string }) {
  const { from, to } = coverGradientFor(title);

  return (
    <LinearGradient
      colors={[from, to]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFill, styles.center]}
    >
      <CoverMonogramText title={title} />
    </LinearGradient>
  );
}

function CoverMonogramText({ title }: { title: string }) {
  // 0 until the first layout. The letter is sized from the width, so it waits for a real width:
  // a font size of 0 crashes Android's text layout.
  const [width, setWidth] = useState(0);

  return (
    <View style={styles.monogramBox} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? <MonogramLetter title={title} width={width} /> : null}
    </View>
  );
}

function MonogramLetter({ title, width }: { title: string; width: number }) {
  return (
    <Text
      variant="title"
      importantForAccessibility="no"
      accessibilityElementsHidden
      style={[
        styles.monogram,
        {
          fontSize: width * coverMonogramRatio,
          lineHeight: width * coverMonogramRatio * coverMonogramLineRatio,
          color: coverMonogramColor,
        },
      ]}
    >
      {monogramFor(title)}
    </Text>
  );
}

const styles = StyleSheet.create({
  frame: {
    aspectRatio: 2 / 3,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramBox: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogram: {
    textAlign: 'center',
  },
});
