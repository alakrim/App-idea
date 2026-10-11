import { AmbienceSettings } from '@/features/settings/ambience-settings';
import { SettingsPage } from '@/features/settings/settings-page';

export default function AmbienceScreen() {
  return (
    <SettingsPage title="Ambience">
      <AmbienceSettings />
    </SettingsPage>
  );
}
