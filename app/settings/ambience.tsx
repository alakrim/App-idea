import { usePlayback } from '@/features/player/player-provider';
import { AmbienceSettings } from '@/features/settings/ambience-settings';
import { SettingsPage } from '@/features/settings/settings-page';

export default function AmbienceScreen() {
  const playback = usePlayback();
  return (
    <SettingsPage title="Ambience">
      <AmbienceSettings onPlaySample={(levelDb) => playback.previewBed(SAMPLE_BED, levelDb)} />
    </SettingsPage>
  );
}

/** The bed the settings sample plays: the procedural rain from the bundled base pack. */
const SAMPLE_BED = 'base_rain';
