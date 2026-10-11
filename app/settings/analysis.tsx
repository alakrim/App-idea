import { useOpenRouter } from '@/app-shell/openrouter-provider';
import { isModelMissing, useModelCatalog } from '@/features/settings/model-catalog';
import { modelKindConfig } from '@/features/settings/model-kinds';
import { ModelRow } from '@/features/settings/model-row';
import { SettingsPage } from '@/features/settings/settings-page';
import { SettingsSection } from '@/features/settings/settings-section';
import { useSettings } from '@/features/settings/settings-store';
import { Text } from '@/ui/text';

/** Models behind the chapter memory, ambience cues and content cleanup. */
export default function AnalysisScreen() {
  const client = useOpenRouter();
  const { settings } = useSettings();
  const catalog = useModelCatalog(client, 'text');
  const analysis = modelKindConfig('analysis', settings);
  const cleanup = modelKindConfig('cleanup', settings);

  return (
    <SettingsPage title="Analysis and cleanup">
      <Text variant="body" tone="muted">
        Analysis builds each chapter&apos;s memory and ambience cues. Cleanup strips menus, ads and
        other page clutter before reading. Both need models that return structured output.
      </Text>
      <SettingsSection title="Models">
        <ModelRow
          title="Analysis model"
          kind="analysis"
          modelId={settings.analysisModel}
          missing={isModelMissing(catalog.state, analysis.selectedId)}
        />
        <ModelRow
          title="Cleanup model"
          kind="cleanup"
          modelId={settings.cleanupModel}
          missing={isModelMissing(catalog.state, cleanup.selectedId)}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
