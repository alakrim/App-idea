import { PlaybackSettings } from '@/features/settings/playback-settings';
import { SettingsPage } from '@/features/settings/settings-page';

export default function PlaybackScreen() {
  return (
    <SettingsPage title="Playback">
      <PlaybackSettings />
    </SettingsPage>
  );
}
