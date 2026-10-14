import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { useDb } from '@/db/hooks';
import { SettingsSection } from '@/features/settings/settings-section';
import { useSettings } from '@/features/settings/settings-store';
import {
  ambienceSummary,
  analysisSummary,
  apiKeySummary,
  narrationSummary,
  playbackSummary,
  readingSummary,
  storageSummary,
  themeLabel,
  translationSummary,
  usageSummary,
} from '@/features/settings/summaries';
import { loadUsageSummary } from '@/features/settings/usage-query';
import { useSavedKey } from '@/features/settings/use-saved-key';
import { bytesUsedByLibrary, freeSpaceBytes } from '@/services/storage';
import {
  BookOpen,
  CircleDollarSign,
  Gauge,
  HardDrive,
  Info,
  KeyRound,
  Languages,
  Mic,
  Palette,
  Sparkles,
  Wind,
} from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { Screen } from '@/ui/screen';

/** The settings home. Each row shows its current value, so most answers are visible without opening it. */
export default function SettingsScreen() {
  const db = useDb();
  const { settings } = useSettings();
  const saved = useSavedKey();
  const [now] = useState(() => Date.now());
  const usage = useMemo(() => loadUsageSummary(db, now), [db, now]);
  const [storage] = useState(() => ({
    used: bytesUsedByLibrary().totalBytes,
    free: freeSpaceBytes(),
  }));
  const version = Constants.expoConfig?.version ?? 'Unknown';

  const todayCost = usage.windows.find((window) => window.id === 'today')?.costUsd ?? 0;
  const monthCost = usage.windows.find((window) => window.id === 'month')?.costUsd ?? 0;

  return (
    <Screen title="Settings">
      <SettingsSection title="Account">
        <ListItem
          title="API key"
          subtitle={apiKeySummary(saved.status, saved.tail)}
          leading={KeyRound}
          onPress={() => router.push('/settings/api-key')}
          accessibilityHint="Opens your OpenRouter key settings"
        />
      </SettingsSection>

      <SettingsSection title="Models and voices">
        <ListItem
          title="Narration"
          subtitle={narrationSummary(settings.narration)}
          leading={Mic}
          onPress={() => router.push('/settings/narration')}
        />
        <ListItem
          title="Translation"
          subtitle={translationSummary(settings)}
          leading={Languages}
          onPress={() => router.push('/settings/translation')}
        />
        <ListItem
          title="Analysis and cleanup"
          subtitle={analysisSummary(settings)}
          leading={Sparkles}
          onPress={() => router.push('/settings/analysis')}
        />
      </SettingsSection>

      <SettingsSection title="Listening and reading">
        <ListItem
          title="Ambience"
          subtitle={ambienceSummary(settings.ambience)}
          leading={Wind}
          onPress={() => router.push('/settings/ambience')}
        />
        <ListItem
          title="Playback"
          subtitle={playbackSummary(settings.playback)}
          leading={Gauge}
          onPress={() => router.push('/settings/playback')}
        />
        <ListItem
          title="Reading"
          subtitle={readingSummary(settings.reading)}
          leading={BookOpen}
          onPress={() => router.push('/settings/reading')}
        />
      </SettingsSection>

      <SettingsSection title="App">
        <ListItem
          title="Appearance"
          subtitle={themeLabel(settings.theme)}
          leading={Palette}
          onPress={() => router.push('/settings/appearance')}
        />
        <ListItem
          title="Usage and costs"
          subtitle={usageSummary(todayCost, monthCost)}
          leading={CircleDollarSign}
          onPress={() => router.push('/settings/usage')}
        />
        <ListItem
          title="Storage"
          subtitle={storageSummary(storage.used, storage.free)}
          leading={HardDrive}
        />
        <ListItem
          title="About"
          subtitle={`Version ${version}`}
          leading={Info}
          onPress={() => router.push('/settings/about')}
        />
      </SettingsSection>
    </Screen>
  );
}
