import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { hairline, minTouchTarget, space } from '@/ui/tokens';

/** Separators start where the row text starts: after the leading icon tile and its gaps. */
const SEPARATOR_INSET = minTouchTarget + space.md + space.lg;

export interface SettingsSectionProps {
  title?: string;
  children: ReactNode;
}

/** A labelled group of rows in one card, with hairline separators between rows. */
export function SettingsSection({ title, children }: SettingsSectionProps) {
  const { colors } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);

  return (
    <View style={styles.section}>
      {title ? (
        <Text variant="micro" tone="faint" accessibilityRole="header" style={styles.heading}>
          {title}
        </Text>
      ) : null}
      <Card style={styles.card}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 ? (
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
            ) : null}
            {row}
          </Fragment>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.sm,
  },
  heading: {
    paddingHorizontal: space.xs,
  },
  card: {
    padding: 0,
    gap: 0,
    overflow: 'hidden',
  },
  separator: {
    height: hairline,
    marginLeft: SEPARATOR_INSET,
  },
});
