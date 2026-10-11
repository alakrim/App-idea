import * as Clipboard from 'expo-clipboard';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ErrorState } from '@/ui/error-state';
import { useTheme } from '@/ui/theme';

/** Plain-text diagnostics for a bug report. Never include settings or keys here. */
export function formatErrorDetails(context: string, error: unknown): string {
  const lines = [`Lectio on ${Platform.OS}`, `Context: ${context}`];
  if (error instanceof Error) {
    lines.push(`${error.name}: ${error.message}`);
    if (error.stack) {
      lines.push(error.stack.split('\n').slice(0, 6).join('\n'));
    }
  } else {
    lines.push(`Thrown value: ${typeof error}`);
  }
  return lines.join('\n');
}

/** Hiding is idempotent. A failure only leaves the splash up for longer, so it is ignored. */
export function hideSplashScreen(): void {
  SplashScreen.hideAsync().catch(() => undefined);
}

const COPIED_LABEL_MS = 2000;

export interface FatalErrorProps {
  title: string;
  message: string;
  /** Diagnostic text for the "Copy details" action. */
  details: string;
  onRetry: () => void;
}

/** A full-screen failure that says what happened, offers Try again, and can copy diagnostics. */
export function FatalError({ title, message, details, onRetry }: FatalErrorProps) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), COPIED_LABEL_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyDetails = () => {
    void Clipboard.setStringAsync(details);
    setCopied(true);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <ErrorState
        title={title}
        message={message}
        onRetry={onRetry}
        retryLabel="Try again"
        secondaryLabel={copied ? 'Copied' : 'Copy details'}
        onSecondary={copyDetails}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
