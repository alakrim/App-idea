import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { ClipboardPaste, ExternalLink } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { formatUsd } from '@/core/llm/cost';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Skeleton } from '@/ui/skeleton';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';
import { useToast } from '@/ui/toast';
import { space } from '@/ui/tokens';

import { formatUsdPrecise } from './format';

import type { KeyAccount, KeyConnection } from './use-key-connection';

export const OPENROUTER_KEYS_URL = 'https://openrouter.ai/keys';

export interface KeyFormProps {
  connection: KeyConnection;
  /** Validates then saves the key. Resolves true when it was saved. */
  onSubmit: (key: string) => Promise<boolean>;
  /** Clears a failure message when the user edits the key. */
  onReset: () => void;
  submitLabel?: string;
}

/**
 * Paste, check and save an OpenRouter key. Used by onboarding and the API key screen. The field
 * is masked and the key is only checked, never echoed in status text.
 */
export function KeyForm({
  connection,
  onSubmit,
  onReset,
  submitLabel = 'Check and save',
}: KeyFormProps) {
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [pasteHint, setPasteHint] = useState<string | null>(null);

  const checking = connection.status === 'checking';
  const connected = connection.status === 'connected';
  const canSubmit = draft.trim().length > 0 && !checking;

  const submit = async () => {
    const saved = await onSubmit(draft);
    if (saved) {
      setDraft('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    }
  };

  const paste = async () => {
    try {
      const text = (await Clipboard.getStringAsync()).trim();
      if (text === '') {
        setPasteHint('Nothing to paste. Copy your key first, then try again.');
        return;
      }
      setPasteHint(null);
      setDraft(text);
      onReset();
    } catch {
      setPasteHint('The clipboard is not available. Paste the key into the field instead.');
    }
  };

  const openKeysPage = () => {
    Linking.openURL(OPENROUTER_KEYS_URL).catch(() => {
      toast.show({ message: `Open ${OPENROUTER_KEYS_URL} in your browser.`, tone: 'danger' });
    });
  };

  return (
    <View style={styles.form}>
      {connected ? null : (
        <View style={styles.linkRow}>
          <Button
            label="Get a key on openrouter.ai"
            variant="ghost"
            icon={ExternalLink}
            onPress={openKeysPage}
            accessibilityHint="Opens the OpenRouter keys page in your browser"
          />
        </View>
      )}

      {connected ? null : (
        <TextField
          label="OpenRouter key"
          placeholder="sk-or-…"
          value={draft}
          onChangeText={(next) => {
            setDraft(next);
            if (connection.status === 'failed') onReset();
          }}
          secure
          editable={!checking && !connected}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={() => {
            if (canSubmit) void submit();
          }}
          error={connection.status === 'failed' ? connection.message : undefined}
          helper={connected ? undefined : 'Keys start with sk-or-. Lectio checks it before saving.'}
        />
      )}

      {connected ? null : (
        <View style={styles.actions}>
          <Button
            label="Paste from clipboard"
            variant="secondary"
            icon={ClipboardPaste}
            disabled={checking}
            onPress={() => void paste()}
          />
          {pasteHint ? (
            <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
              {pasteHint}
            </Text>
          ) : null}
          <Button
            label={checking ? 'Checking your key' : submitLabel}
            size="lg"
            fullWidth
            loading={checking}
            disabled={!canSubmit}
            onPress={() => void submit()}
          />
        </View>
      )}

      <KeyStatus connection={connection} />
    </View>
  );
}

function KeyStatus({ connection }: { connection: KeyConnection }) {
  if (connection.status === 'checking') {
    return (
      <Card>
        <Skeleton height={space.lg} label="Checking your key" />
        <Skeleton height={space.lg} width="60%" />
        <Text variant="caption" tone="muted">
          Checking with OpenRouter…
        </Text>
      </Card>
    );
  }
  if (connection.status === 'connected') {
    return <AccountDetails account={connection.account} />;
  }
  return null;
}

/** What OpenRouter reports about a key: its label, spend so far and remaining limit. */
export function AccountDetails({ account }: { account: KeyAccount }) {
  return (
    <Card>
      <View style={styles.accountHeader}>
        <Badge label="Connected" tone="success" />
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {account.label}
        </Text>
      </View>
      <Text variant="body">{usageLine(account)}</Text>
      <Text variant="caption" tone="muted">
        {limitLine(account)}
      </Text>
    </Card>
  );
}

export function usageLine(account: KeyAccount): string {
  return `${formatUsdPrecise(account.usage)} used so far on this key`;
}

export function limitLine(account: KeyAccount): string {
  if (account.limitRemaining !== null) {
    return `${formatUsd(account.limitRemaining)} left under your spending limit`;
  }
  return account.isFreeTier ? 'Free tier' : 'No spending limit set';
}

const styles = StyleSheet.create({
  form: {
    gap: space.md,
  },
  linkRow: {
    alignSelf: 'flex-start',
  },
  actions: {
    gap: space.sm,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
});
