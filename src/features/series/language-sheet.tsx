import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { LANGUAGES } from '@/features/shared/languages';
import { Check } from '@/ui/icons';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { iconSize, iconStrokeWidth, minTouchTarget, radius, space } from '@/ui/tokens';

/** "Not set" is a real choice: the series then has no language for that side. */
const NOT_SET = null;
type Choice = string | typeof NOT_SET;

export interface LanguageSheetProps {
  visible: boolean;
  title: string;
  value: string | null;
  onSelect: (code: string | null) => void;
  onClose: () => void;
}

export function LanguageSheet({ visible, title, value, onSelect, onClose }: LanguageSheetProps) {
  const choices: Choice[] = [NOT_SET, ...LANGUAGES.map((language) => language.code)];

  return (
    <Sheet visible={visible} onClose={onClose} title={title} snapPoints={['75%']}>
      <FlatList
        data={choices}
        keyExtractor={(item) => item ?? 'not-set'}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <LanguageOption
            code={item}
            selected={item === value}
            onPress={() => {
              onSelect(item);
              onClose();
            }}
          />
        )}
      />
    </Sheet>
  );
}

interface LanguageOptionProps {
  code: Choice;
  selected: boolean;
  onPress: () => void;
}

function LanguageOption({ code, selected, onPress }: LanguageOptionProps) {
  const { colors } = useTheme();
  const language = LANGUAGES.find((entry) => entry.code === code);
  const label = language ? language.nativeName : 'Not set';
  const detail = language ? language.name : 'Leave the language unset';

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={language ? `${language.nativeName}, ${language.name}` : 'Not set'}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: selected ? colors.accent : colors.border },
        pressed ? { backgroundColor: colors.surfaceRaised } : null,
      ]}
    >
      <View style={styles.copy}>
        <Text variant="bodyStrong">{label}</Text>
        <Text variant="caption" tone="muted">
          {detail}
        </Text>
      </View>
      {selected ? (
        <Check size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.accent} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: space.xs,
    paddingBottom: space.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minTouchTarget + space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  copy: {
    flex: 1,
    gap: space.xxs,
  },
});
