import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useOpenRouter } from '@/app-shell/openrouter-provider';
import { KeyForm, AccountDetails } from '@/features/settings/key-form';
import { maskApiKey } from '@/features/settings/key-format';
import { SettingsPage } from '@/features/settings/settings-page';
import { SettingsSection } from '@/features/settings/settings-section';
import { useKeyConnection } from '@/features/settings/use-key-connection';
import { useSavedKey, useSavedKeyAccount } from '@/features/settings/use-saved-key';
import { ConfirmSheet } from '@/features/shared/confirm-sheet';
import { clearApiKey } from '@/services/secrets';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Skeleton } from '@/ui/skeleton';
import { Text } from '@/ui/text';
import { useToast } from '@/ui/toast';
import { space } from '@/ui/tokens';

/** API key settings. The saved key is only ever shown masked, with its last four characters. */
export default function ApiKeyScreen() {
  const client = useOpenRouter();
  const toast = useToast();
  const saved = useSavedKey();
  const hasKey = saved.status === 'present';
  const account = useSavedKeyAccount(client, hasKey);
  const { connection, connect, reset } = useKeyConnection();
  const [replacing, setReplacing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const showForm = !hasKey || replacing;

  const submit = async (key: string): Promise<boolean> => {
    const saving = await connect(key);
    if (saving) {
      setReplacing(false);
      saved.refresh();
      account.reload();
    }
    return saving;
  };

  const removeKey = () => {
    setConfirmingRemove(false);
    clearApiKey()
      .then(() => {
        reset();
        toast.show({ message: 'Your key was removed from this device.' });
      })
      .catch(() => {
        toast.show({ message: 'The key could not be removed. Try again.', tone: 'danger' });
      });
  };

  return (
    <SettingsPage title="API key">
      <Text variant="body" tone="muted">
        Lectio uses your OpenRouter key for every model call. It stays in this device&apos;s secure
        storage and is sent only to OpenRouter.
      </Text>

      {hasKey && !replacing ? (
        <SettingsSection title="Saved key">
          <Card>
            <Text variant="heading" accessibilityLabel={`Saved key ending ${saved.tail ?? ''}`}>
              {maskApiKey(saved.tail ?? '')}
            </Text>
            {account.state.status === 'checking' ? (
              <View style={styles.loading}>
                <Skeleton height={space.lg} label="Checking your key" />
                <Skeleton height={space.lg} width="55%" />
              </View>
            ) : null}
            {account.state.status === 'ready' ? (
              <AccountDetails account={account.state.account} />
            ) : null}
            {account.state.status === 'failed' ? (
              <View style={styles.failure}>
                <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
                  {account.state.message}
                </Text>
                <Button label="Check again" variant="secondary" onPress={account.reload} />
              </View>
            ) : null}
          </Card>
          <View style={styles.actions}>
            <Button
              label="Replace key"
              variant="secondary"
              fullWidth
              size="lg"
              onPress={() => {
                reset();
                setReplacing(true);
              }}
            />
            <Button
              label="Remove key"
              variant="danger"
              fullWidth
              size="lg"
              onPress={() => setConfirmingRemove(true)}
            />
          </View>
        </SettingsSection>
      ) : null}

      {showForm ? (
        <SettingsSection title={hasKey ? 'New key' : 'Add your key'}>
          <Card>
            <KeyForm
              connection={connection}
              onSubmit={submit}
              onReset={reset}
              submitLabel={hasKey ? 'Replace key' : 'Check and save'}
            />
            {replacing ? (
              <Button
                label="Keep the current key"
                variant="ghost"
                onPress={() => {
                  reset();
                  setReplacing(false);
                }}
              />
            ) : null}
          </Card>
        </SettingsSection>
      ) : null}
      <ConfirmSheet
        visible={confirmingRemove}
        title="Remove your key?"
        message="Lectio cannot reach OpenRouter until you add a key again. Your library and notes stay on this device."
        confirmLabel="Remove"
        destructive
        onCancel={() => setConfirmingRemove(false)}
        onConfirm={removeKey}
      />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  loading: {
    gap: space.sm,
  },
  failure: {
    gap: space.sm,
  },
  actions: {
    gap: space.sm,
  },
});
