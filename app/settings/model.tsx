import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { useOpenRouter } from '@/app-shell/openrouter-provider';
import { ModelNotice } from '@/features/settings/model-notice';
import { ModelPicker } from '@/features/settings/model-picker';
import { modelKindConfig, parseModelKind, type ModelKind } from '@/features/settings/model-kinds';
import { useModelCatalog } from '@/features/settings/model-catalog';
import { SettingsPage } from '@/features/settings/settings-page';
import { useSettings } from '@/features/settings/settings-store';
import { ErrorState } from '@/ui/error-state';
import { Skeleton } from '@/ui/skeleton';
import { space } from '@/ui/tokens';

/** One picker route for every model setting. `kind` selects the filter and the setting it changes. */
export default function ModelPickerScreen() {
  const { kind: rawKind } = useLocalSearchParams<{ kind?: string }>();
  const kind = parseModelKind(rawKind);

  if (kind === null) {
    return (
      <SettingsPage title="Choose a model">
        <ErrorState
          message="This model setting does not exist."
          retryLabel="Go back"
          onRetry={() => router.back()}
        />
      </SettingsPage>
    );
  }
  return <Picker kind={kind} />;
}

function Picker({ kind }: { kind: ModelKind }) {
  const client = useOpenRouter();
  const { settings, patch } = useSettings();
  const config = modelKindConfig(kind, settings);
  const catalog = useModelCatalog(client, config.modality);

  const loaded = catalog.state.status === 'live' || catalog.state.status === 'cached';
  const models = loaded ? catalog.state.models.filter(config.accept) : [];
  const isMissing = loaded && !models.some((model) => model.id === config.selectedId);

  return (
    <SettingsPage title={config.title} scrollable={false}>
      {catalog.state.status === 'loading' ? (
        <View style={{ gap: space.sm }}>
          <Skeleton height={space.xxl} label="Loading models" />
          <Skeleton height={space.xxl} />
          <Skeleton height={space.xxl} width="70%" />
        </View>
      ) : null}

      {catalog.state.status === 'unavailable' ? (
        <ErrorState
          title="Models are unavailable"
          message={catalog.state.message}
          onRetry={catalog.reload}
        />
      ) : null}

      {loaded ? (
        <ModelPicker
          models={models}
          selectedId={isMissing ? null : config.selectedId}
          recommendedId={config.recommendedId}
          describe={config.describe}
          searchLabel={config.searchLabel}
          onSelect={(model) => {
            patch(config.patchFor(model));
            router.back();
          }}
          header={
            <>
              {catalog.state.status === 'cached' ? (
                <ModelNotice
                  tone="neutral"
                  message={`You are offline. Showing the list saved on ${new Date(catalog.state.savedAt).toLocaleDateString()}.`}
                />
              ) : null}
              {isMissing ? (
                <ModelNotice
                  tone="warning"
                  message={`Your current model, ${config.selectedId}, is no longer offered. Pick a replacement below.`}
                />
              ) : null}
            </>
          }
        />
      ) : null}
    </SettingsPage>
  );
}
