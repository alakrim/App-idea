import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { KeyForm } from '@/features/settings/key-form';
import { useKeyConnection } from '@/features/settings/use-key-connection';
import { Button } from '@/ui/button';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

export interface ConnectStepProps {
  /** Called once a key is saved. */
  onDone: () => void;
  /** Called when the user skips the key. The app still works without one. */
  onSkip: () => void;
}

/** Onboarding step 2: connect a key, or skip it. Skipping is allowed. */
export function ConnectStep({ onDone, onSkip }: ConnectStepProps) {
  const { connection, connect, reset } = useKeyConnection();
  const connected = connection.status === 'connected';

  // Android resizes the window for the keyboard, so only iOS needs the padding behaviour here.
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.copy}>
          <Text variant="title" accessibilityRole="header">
            Connect OpenRouter
          </Text>
          <Text variant="body" tone="muted">
            Lectio runs the models with your own OpenRouter key. It is kept in this device&apos;s
            secure storage and sent only to OpenRouter. You can skip this and connect later.
          </Text>
        </View>

        <KeyForm connection={connection} onSubmit={connect} onReset={reset} />

        <View style={styles.footer}>
          {connected ? (
            <Button label="Continue" size="lg" fullWidth onPress={onDone} />
          ) : (
            <Button
              label="Skip for now"
              variant="ghost"
              onPress={onSkip}
              disabled={connection.status === 'checking'}
            />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.xxl,
    paddingBottom: space.xl,
    gap: space.lg,
  },
  copy: {
    gap: space.sm,
  },
  footer: {
    marginTop: 'auto',
  },
});
