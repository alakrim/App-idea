import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Eye, EyeOff } from '@/ui/icons';

import { IconButton } from './icon-button';
import { Text } from './text';
import { useTheme } from './theme';
import {
  hairline,
  maxFontScale,
  minTouchTarget,
  opacity,
  radius,
  space,
  typography,
} from './tokens';

export interface TextFieldProps extends Omit<
  TextInputProps,
  'style' | 'accessibilityLabel' | 'placeholderTextColor'
> {
  /** Visible label, also the accessible name of the input. */
  label: string;
  helper?: string;
  /** When set, the field shows the error in danger colour and announces it. */
  error?: string;
  /** Adds a show/hide control and starts masked. */
  secure?: boolean;
  /** Sizes a multi-line field to this many text lines. Ignored unless `multiline` is set. */
  lines?: number;
}

export function TextField({
  label,
  helper,
  error,
  secure = false,
  editable = true,
  lines,
  ...inputProps
}: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [masked, setMasked] = useState(true);

  const borderColor = error ? colors.danger : focused ? colors.accent : colors.boundary;
  const message = error ?? helper;

  return (
    <View style={styles.wrapper}>
      <Text variant="caption" tone="muted" accessibilityElementsHidden>
        {label}
      </Text>
      <View
        style={[
          styles.field,
          { backgroundColor: colors.surfaceRaised, borderColor },
          !editable && styles.disabled,
        ]}
      >
        <TextInput
          {...inputProps}
          editable={editable}
          accessibilityLabel={label}
          accessibilityHint={message}
          accessibilityState={{ disabled: !editable }}
          placeholderTextColor={colors.textFaint}
          secureTextEntry={secure && masked}
          autoCorrect={secure ? false : inputProps.autoCorrect}
          autoCapitalize={secure ? 'none' : inputProps.autoCapitalize}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
          maxFontSizeMultiplier={maxFontScale}
          style={[
            styles.input,
            { color: colors.text },
            inputProps.multiline ? styles.multiline : null,
            inputProps.multiline && lines !== undefined
              ? { minHeight: multilineHeight(lines) }
              : null,
          ]}
        />
        {secure ? (
          <IconButton
            label={masked ? 'Show value' : 'Hide value'}
            icon={masked ? Eye : EyeOff}
            onPress={() => setMasked((value) => !value)}
            disabled={!editable}
          />
        ) : null}
      </View>
      {message ? (
        <Text
          variant="caption"
          tone={error ? 'danger' : 'muted'}
          accessibilityLiveRegion={error ? 'polite' : 'none'}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: space.xs,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minTouchTarget,
    borderRadius: radius.md,
    borderWidth: hairline,
    paddingLeft: space.md,
    paddingRight: space.xs,
  },
  input: {
    flex: 1,
    minHeight: minTouchTarget,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.size,
    lineHeight: typography.body.lineHeight,
    paddingVertical: space.sm,
  },
  multiline: {
    textAlignVertical: 'top',
  },
  disabled: {
    opacity: opacity.disabled,
  },
});

/** Height of a field that shows `lines` lines of body text, padding included. */
function multilineHeight(lines: number): number {
  return lines * typography.body.lineHeight + space.sm * 2;
}
