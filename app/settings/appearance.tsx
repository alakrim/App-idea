import { AppearanceSettings } from '@/features/settings/appearance-settings';
import { SettingsPage } from '@/features/settings/settings-page';

export default function AppearanceScreen() {
  return (
    <SettingsPage title="Appearance">
      <AppearanceSettings />
    </SettingsPage>
  );
}
