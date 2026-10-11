import { useTheme } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function IndexScreen() {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        Lectio
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
  },
});
