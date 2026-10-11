import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { parseAmbienceLicenses } from '@/features/settings/licenses';
import { SettingsPage } from '@/features/settings/settings-page';
import { SettingsSection } from '@/features/settings/settings-section';
import { Stethoscope } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

import ambienceLicenses from '../../assets/ambience/LICENSES.json';

const FONT_LICENSE = 'SIL Open Font License 1.1';
/** Taps on the version that unlock the diagnostics link for testers. */
const TAPS_TO_UNLOCK_DIAGNOSTICS = 7;

/** Version, typefaces and the licences of the sounds and code that ship with the app. */
export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? 'Unknown';
  const sounds = parseAmbienceLicenses(ambienceLicenses);
  const taps = useRef(0);
  const [unlocked, setUnlocked] = useState(false);
  // Development builds always show the diagnostics; release builds unlock them by tapping the version.
  const showDiagnostics = __DEV__ || unlocked;

  return (
    <SettingsPage title="About">
      <View style={styles.hero}>
        <Text variant="title" accessibilityRole="header">
          Lectio
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Version ${version}`}
          accessibilityHint="Tap seven times to show diagnostics"
          onPress={() => {
            taps.current += 1;
            if (taps.current >= TAPS_TO_UNLOCK_DIAGNOSTICS) setUnlocked(true);
          }}
        >
          <Text variant="body" tone="muted">
            {`Version ${version}. Turn any page into an audiobook you can listen to, or study in two languages.`}
          </Text>
        </Pressable>
      </View>

      {showDiagnostics ? (
        <SettingsSection title="Support">
          <ListItem
            title="Diagnostics"
            subtitle="Device checks and a report to copy"
            leading={Stethoscope}
            accessibilityHint="Opens the diagnostics checks"
            onPress={() => router.push('/settings/diagnostics')}
          />
        </SettingsSection>
      ) : null}

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
