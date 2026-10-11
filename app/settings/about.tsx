import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';

import { parseAmbienceLicenses } from '@/features/settings/licenses';
import { SettingsPage } from '@/features/settings/settings-page';
import { SettingsSection } from '@/features/settings/settings-section';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

import ambienceLicenses from '../../assets/ambience/LICENSES.json';

const FONT_LICENSE = 'SIL Open Font License 1.1';

/** Version, typefaces and the licences of the sounds and code that ship with the app. */
export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? 'Unknown';
  const sounds = parseAmbienceLicenses(ambienceLicenses);

  return (
    <SettingsPage title="About">
      <View style={styles.hero}>
        <Text variant="title" accessibilityRole="header">
          Lectio
        </Text>
        <Text variant="body" tone="muted">
          {`Version ${version}. Turn any page into an audiobook you can listen to, or study in two languages.`}
        </Text>
      </View>

      <SettingsSection title="Typefaces">
        <LicenseRow title="Inter" detail={FONT_LICENSE} />
        <LicenseRow title="Literata" detail={FONT_LICENSE} />
      </SettingsSection>

      <SettingsSection title="Ambience sounds">
        {sounds.map((sound) => (
          <LicenseRow key={sound.id} title={sound.title} detail={sound.license} />
        ))}
      </SettingsSection>
    </SettingsPage>
  );
}

function LicenseRow({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${title}: ${detail}`}>
      <Text variant="bodyStrong">{title}</Text>
      <Text variant="caption" tone="muted">
        {detail}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: space.sm,
  },
  row: {
    gap: space.xxs,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
