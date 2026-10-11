import { ReadingSettings } from '@/features/settings/reading-settings';
import { SettingsPage } from '@/features/settings/settings-page';

export default function ReadingScreen() {
  return (
    <SettingsPage title="Reading">
      <ReadingSettings />
    </SettingsPage>
  );
}
