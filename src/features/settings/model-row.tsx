import { router } from 'expo-router';

import { ListItem } from '@/ui/list-item';

import { modelLabel } from './format';
import { type ModelKind } from './model-kinds';

export interface ModelRowProps {
  title: string;
  kind: ModelKind;
  modelId: string;
  /** True when the saved model is no longer in the catalog. */
  missing: boolean;
}

/** A settings row for one model. Opens the shared picker for `kind`. */
export function ModelRow({ title, kind, modelId, missing }: ModelRowProps) {
  return (
    <ListItem
      title={title}
      subtitle={
        missing ? `${modelLabel(modelId)} is no longer offered. Choose another.` : modelLabel(modelId)
      }
      onPress={() => router.push({ pathname: '/settings/model', params: { kind } })}
      accessibilityHint={`Opens the ${title.toLowerCase()} picker`}
    />
  );
}
