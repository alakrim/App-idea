import { NarrationPanel } from '@/features/settings/narration-settings';
import { SettingsPage } from '@/features/settings/settings-page';

/** Narration settings: voice model tiers with live prices, voices, style, speed and a preview. */
export default function NarrationScreen() {
  return (
    <SettingsPage title="Narration">
      <NarrationPanel />
    </SettingsPage>
  );
}
