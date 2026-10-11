import * as SecureStore from 'expo-secure-store';

import type * as SecretsNamespace from './secrets';

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 6,
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const VALID_KEY = 'sk-or-v1-0123456789abcdef0123456789abcdef';

type SecretsModule = typeof SecretsNamespace;

function loadSecrets(): SecretsModule {
  let loaded: SecretsModule | undefined;
  jest.isolateModules(() => {
    loaded = jest.requireActual<SecretsModule>('./secrets');
  });
  if (!loaded) throw new Error('secrets module did not load');
  return loaded;
}

const secureStore = jest.mocked(SecureStore);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isWellFormedApiKey', () => {
  const secrets = loadSecrets();

  it.each([
    [VALID_KEY, true],
    ['sk-or-v1_abc-DEF_0123456789', true],
    ['sk-proj-0123456789abcdef0123456789', false],
    ['sk-or-short', false],
    [`sk-or-${'a'.repeat(250)}`, false],
    ['sk-or-v1 with spaces in it', false],
    ['', false],
  ])('%s -> %s', (key, expected) => {
    expect(secrets.isWellFormedApiKey(key)).toBe(expected);
  });
});

describe('setApiKey / getApiKey / clearApiKey', () => {
  it('saves a trimmed key with AFTER_FIRST_UNLOCK', async () => {
    const secrets = loadSecrets();

    await secrets.setApiKey(`  ${VALID_KEY}\n`);

    expect(secureStore.setItemAsync).toHaveBeenCalledWith('openrouter.api-key', VALID_KEY, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  });

  it('rejects a malformed key without touching the keystore', async () => {
    const secrets = loadSecrets();

    await expect(secrets.setApiKey('not-a-key')).rejects.toBeInstanceOf(secrets.InvalidApiKeyError);
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('never puts the key in an error message or a log', async () => {
    const secrets = loadSecrets();
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const badKey = 'sk-or-v1 spaces leak-me-if-logged';

    try {
      const caught = await secrets.setApiKey(badKey).catch((e: unknown) => e);
      await secrets.setApiKey(VALID_KEY);
      await secrets.clearApiKey();

      expect(caught).toBeInstanceOf(secrets.InvalidApiKeyError);
      expect(String((caught as Error).message)).not.toContain('leak-me');
      for (const spy of [log, warn, error]) {
        expect(spy).not.toHaveBeenCalled();
      }
    } finally {
      log.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it('reads and clears the key from the keystore', async () => {
    const secrets = loadSecrets();
    secureStore.getItemAsync.mockResolvedValueOnce(VALID_KEY);

    await expect(secrets.getApiKey()).resolves.toBe(VALID_KEY);
    await secrets.clearApiKey();

    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('openrouter.api-key', {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  });
});

describe('refreshApiKeyStatus', () => {
  it('publishes present when a key is saved and missing when none is', async () => {
    const secrets = loadSecrets();
    const seen: string[] = [];

    secureStore.getItemAsync.mockResolvedValueOnce(VALID_KEY);
    await secrets.refreshApiKeyStatus();
    seen.push(secrets.getApiKeyStatus());

    secureStore.getItemAsync.mockResolvedValueOnce(null);
    await secrets.refreshApiKeyStatus();
    seen.push(secrets.getApiKeyStatus());

    expect(seen).toEqual(['present', 'missing']);
  });

  it('keeps the status unknown when the keystore cannot be read', async () => {
    const secrets = loadSecrets();
    secureStore.getItemAsync.mockRejectedValueOnce(new Error('locked'));

    await secrets.refreshApiKeyStatus();

    expect(secrets.getApiKeyStatus()).toBe('unknown');
  });
});
