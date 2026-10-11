import { Check } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, View, type ListRenderItem } from 'react-native';

import type { OpenRouterModel } from '@/services/openrouter';
import { Badge } from '@/ui/badge';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';
import { useTheme } from '@/ui/theme';
import { iconSize, iconStrokeWidth, minTouchTarget, radius, space } from '@/ui/tokens';

import { providerLabel } from './format';
import { displayName, filterModels } from './model-search';

export type PickerItem =
  | { kind: 'header'; key: string; title: string }
  | { kind: 'model'; key: string; model: OpenRouterModel; recommended: boolean }
  | { kind: 'empty'; key: string; query: string };

/**
 * The rows the picker shows. With no query the default model leads under "Recommended" and the rest
 * follow under "All models". A query flattens the matches into one "Results" list. Pure, so the
 * ordering and the empty state are testable without rendering.
 */
export function buildPickerItems(
  models: readonly OpenRouterModel[],
  query: string,
  recommendedId: string | null,
): PickerItem[] {
  const matches = filterModels(models, query);
  if (matches.length === 0) {
    return [{ kind: 'empty', key: 'empty', query: query.trim() }];
  }

  const searching = query.trim() !== '';
  const recommended = searching ? undefined : matches.find((model) => model.id === recommendedId);
  const rest = matches.filter((model) => model !== recommended);

  const items: PickerItem[] = [];
  if (recommended) {
    items.push({ kind: 'header', key: 'header-recommended', title: 'Recommended' });
    items.push({
      kind: 'model',
      key: `model-${recommended.id}`,
      model: recommended,
      recommended: true,
    });
  }
  if (rest.length > 0) {
    items.push({
      kind: 'header',
      key: 'header-all',
      title: searching ? 'Results' : recommended ? 'All models' : 'Models',
    });
    for (const model of rest) {
      items.push({
        kind: 'model',
        key: `model-${model.id}`,
        model,
        recommended: model.id === recommendedId,
      });
    }
  }
  return items;
}

export interface ModelPickerProps {
  models: readonly OpenRouterModel[];
  selectedId: string | null;
  recommendedId: string | null;
  /** Second line of each row, such as the context window and the price. */
  describe: (model: OpenRouterModel) => string;
  onSelect: (model: OpenRouterModel) => void;
  searchLabel: string;
  /** Shown above the search field, for notices such as an offline snapshot. */
  header?: ReactNode;
}

/** Searchable model list with a Recommended section and the selected model checked. */
export function ModelPicker({
  models,
  selectedId,
  recommendedId,
  describe,
  onSelect,
  searchLabel,
  header,
}: ModelPickerProps) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const items = useMemo(
    () => buildPickerItems(models, query, recommendedId),
    [models, query, recommendedId],
  );

  const renderItem: ListRenderItem<PickerItem> = ({ item }) => {
    if (item.kind === 'header') {
      return (
        <Text variant="micro" tone="faint" accessibilityRole="header" style={styles.sectionHeader}>
          {item.title}
        </Text>
      );
    }
    if (item.kind === 'empty') {
      return (
        <View style={styles.empty}>
          <Text variant="body" tone="muted" align="center">
            {item.query === ''
              ? 'No models are available for this choice right now.'
              : `No models match "${item.query}". Try a shorter word.`}
          </Text>
        </View>
      );
    }

    const selected = item.model.id === selectedId;
    const label = displayName(item.model);
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={`${label}. ${providerLabel(item.model.id)}. ${describe(item.model)}`}
        accessibilityState={{ checked: selected }}
        onPress={() => onSelect(item.model)}
        style={({ pressed }) => [
          styles.row,
          pressed ? { backgroundColor: colors.surfaceRaised } : null,
        ]}
      >
        <View style={[styles.monogram, { backgroundColor: colors.accentSoft }]}>
          <Text variant="bodyStrong" tone="accent">
            {providerLabel(item.model.id).charAt(0)}
          </Text>
        </View>
        <View style={styles.copy}>
          <View style={styles.titleLine}>
            <Text variant="bodyStrong" numberOfLines={1} style={styles.titleText}>
              {label}
            </Text>
            {item.recommended ? <Badge label="Recommended" tone="accent" /> : null}
          </View>
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {`${providerLabel(item.model.id)} · ${describe(item.model)}`}
          </Text>
        </View>
        {selected ? (
          <Check size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.accent} />
        ) : null}
      </Pressable>
    );
  };

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          {header}
          <TextField
            label={searchLabel}
            placeholder="Name or provider"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: space.xxl,
    gap: space.xs,
  },
  headerBlock: {
    gap: space.lg,
    paddingBottom: space.md,
  },
  sectionHeader: {
    paddingTop: space.lg,
    paddingBottom: space.xs,
    paddingHorizontal: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: minTouchTarget + space.md,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
  monogram: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: space.xxs,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  titleText: {
    flexShrink: 1,
  },
  empty: {
    paddingVertical: space.xxl,
    paddingHorizontal: space.md,
  },
});
