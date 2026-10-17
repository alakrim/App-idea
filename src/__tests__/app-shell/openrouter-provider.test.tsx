import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  LECTIO_APP_TITLE,
  LECTIO_APP_URL,
  OpenRouterProvider,
  createLectioOpenRouter,
  useOpenRouter,
} from '@/app-shell/openrouter-provider';
import { readCatalogSnapshot, writeCatalogSnapshot } from '@/services/catalog-cache';
import type * as CatalogCache from '@/services/catalog-cache';
import type { OpenRouterClient } from '@/services/openrouter';
import { createFakeFetch, jsonResponse } from '@/services/openrouter/__fixtures__/fake-fetch';

// The file store is replaced; the persistence policy itself is the real one.
jest.mock('@/services/catalog-cache', () => {
  const actual: typeof CatalogCache = jest.requireActual('@/services/catalog-cache');
  const readCatalogSnapshot = jest.fn<string | null, []>(() => null);
  const writeCatalogSnapshot = jest.fn<void, [string]>();
  return {
    persistCatalog: actual.persistCatalog,
    CATALOG_FILE_STORE: { read: readCatalogSnapshot, write: writeCatalogSnapshot },
    readCatalogSnapshot,
    writeCatalogSnapshot,
  };
});
jest.mock('@/services/secrets', () => ({
  getApiKey: jest.fn(async () => 'sk-or-v1-0123456789abcdef0123456789abcdef'),
}));

const apiModel = {
  id: 'anthropic/claude-haiku-5.5',
  name: 'Anthropic: Claude Haiku 5.5',
  context_length: 1_000_000,
  pricing: { prompt: '0.0000001', completion: '0.0000005' },
  architecture: { input_modalities: ['text'], output_modalities: ['text'] },
  supported_parameters: ['structured_outputs'],
};

const readMock = jest.mocked(readCatalogSnapshot);
const writeMock = jest.mocked(writeCatalogSnapshot);

beforeEach(() => {
  jest.clearAllMocks();
  readMock.mockReturnValue(null);
});

describe('createLectioOpenRouter', () => {
  it('sends the app URL and title on every request', async () => {
    const fake = createFakeFetch(() => jsonResponse({ data: [apiModel] }));
    const client = createLectioOpenRouter({ fetchImpl: fake.fetchImpl });

    await client.models.list();

    expect(LECTIO_APP_URL).toBe('https://lectio.app');
    expect(LECTIO_APP_TITLE).toBe('Lectio');
    const headers = fake.calls[0]?.headers ?? {};
    expect(headers['HTTP-Referer']).toBe('https://lectio.app');
    expect(headers['X-Title']).toBe('Lectio');
  });

  it('rehydrates the saved catalog before any request, so no fetch is needed', async () => {
    const saved = JSON.stringify({
      version: 1,
      entries: [
        {
          outputModality: 'text',
          fetchedAt: Date.now(),
          models: [
            {
              id: 'cached/model',
              name: 'Cached',
              contextLength: 1,
              pricing: { prompt: 0, completion: 0 },
              inputModalities: ['text'],
              outputModalities: ['text'],
              supportedParameters: [],
              supportedVoices: [],
            },
          ],
        },
      ],
    });
    readMock.mockReturnValue(saved);
    const fake = createFakeFetch(() => {
      throw new Error('should not fetch while the cache is fresh');
    });
    const client = createLectioOpenRouter({ fetchImpl: fake.fetchImpl });

    const models = await client.models.list();

    expect(models.map((model) => model.id)).toEqual(['cached/model']);
    expect(fake.calls).toHaveLength(0);
  });

  it('writes the catalog snapshot after a successful fetch', async () => {
    const fake = createFakeFetch(() => jsonResponse({ data: [apiModel] }));
    const client = createLectioOpenRouter({ fetchImpl: fake.fetchImpl });

    await client.models.list();

    expect(writeMock).toHaveBeenCalledTimes(1);
    const written = String(writeMock.mock.calls[0]?.[0]);
    expect(written).toContain('anthropic/claude-haiku-5.5');
    expect(written).not.toContain('sk-or-');
  });

  it('does not rewrite the cache on a cache hit', async () => {
    const fake = createFakeFetch(() => jsonResponse({ data: [apiModel] }));
    const client = createLectioOpenRouter({ fetchImpl: fake.fetchImpl });

    await client.models.list();
    await client.models.list();
    await client.models.list();

    expect(fake.calls).toHaveLength(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it('reads the saved catalogue on first model use, not while the client is built', async () => {
    const fake = createFakeFetch(() => jsonResponse({ data: [apiModel] }));
    const client = createLectioOpenRouter({ fetchImpl: fake.fetchImpl });
    expect(readMock).not.toHaveBeenCalled();

    await client.models.list();

    expect(readMock).toHaveBeenCalledTimes(1);
  });

  it('does not write the cache when the fetch fails', async () => {
    const fake = createFakeFetch(() =>
      jsonResponse({ error: { message: 'down' } }, { status: 500 }),
    );
    const client = createLectioOpenRouter({ fetchImpl: fake.fetchImpl });

    await expect(client.models.list()).rejects.toThrow();
    expect(writeMock).not.toHaveBeenCalled();
  });
});

describe('OpenRouterProvider', () => {
  function Probe({ onClient }: { onClient: (client: OpenRouterClient) => void }) {
    onClient(useOpenRouter());
    return <Text>probe</Text>;
  }

  it('hands the provided client to descendants', async () => {
    const fake = createFakeFetch(() => jsonResponse({ data: [] }));
    const client = createLectioOpenRouter({ fetchImpl: fake.fetchImpl });
    const seen: OpenRouterClient[] = [];

    await render(
      <OpenRouterProvider client={client}>
        <Probe onClient={(value) => seen.push(value)} />
      </OpenRouterProvider>,
    );

    expect(screen.getByText('probe')).toBeTruthy();
    expect(seen[0]).toBe(client);
  });

  it('throws a clear error when used outside the provider', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(render(<Probe onClient={() => undefined} />)).rejects.toThrow(
        /inside <OpenRouterProvider>/,
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
