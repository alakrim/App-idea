import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { OpenRouterClient, OpenRouterModel } from '@/services/openrouter';

import { useModelCatalog } from './model-catalog';

function speech(id: string): OpenRouterModel {
  return {
    id,
    name: id,
    contextLength: 0,
    pricing: { prompt: 0, completion: 0 },
    inputModalities: ['text'],
    outputModalities: ['speech'],
    supportedParameters: [],
    supportedVoices: [],
    createdAt: null,
  };
}

const A = speech('vendor/a');
const B = speech('vendor/b');
const noCache = () => null;

/** A request whose reply the test decides, and when. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Only `models.list` is used by the hook, so the rest of the client is left out. */
function clientWith(list: jest.Mock): OpenRouterClient {
  return { models: { list } } as unknown as OpenRouterClient;
}

describe('useModelCatalog', () => {
  it('asks OpenRouter live on every mount, and shows loading until the reply lands', async () => {
    const reply = deferred<OpenRouterModel[]>();
    const list = jest.fn().mockReturnValue(reply.promise);
    const client = clientWith(list);
    const { result } = await renderHook(() => useModelCatalog(client, 'speech', noCache));

    expect(result.current.state).toEqual({ status: 'loading' });
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ outputModality: 'speech', fresh: true }),
    );

    await act(async () => reply.resolve([A]));
    expect(result.current.state).toEqual({ status: 'live', models: [A] });
    expect(result.current.refreshing).toBe(false);
  });

  it('keeps the loaded list on screen while a reload is in flight, then replaces it', async () => {
    const reply = deferred<OpenRouterModel[]>();
    const list = jest.fn().mockResolvedValueOnce([A]).mockReturnValueOnce(reply.promise);
    const client = clientWith(list);
    const { result } = await renderHook(() => useModelCatalog(client, 'speech', noCache));
    await waitFor(() => expect(result.current.state.status).toBe('live'));

    await act(async () => result.current.reload());
    expect(list).toHaveBeenCalledTimes(2);
    expect(result.current.refreshing).toBe(true);
    expect(result.current.state).toEqual({ status: 'live', models: [A] });

    await act(async () => reply.resolve([B]));
    expect(result.current.refreshing).toBe(false);
    expect(result.current.state).toEqual({ status: 'live', models: [B] });
  });

  it('falls back to the saved snapshot when the live request fails', async () => {
    const client = clientWith(jest.fn().mockRejectedValue(new Error('offline')));
    const cache = () => ({ models: [A], savedAt: 42 });
    const { result } = await renderHook(() => useModelCatalog(client, 'speech', cache));

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'cached', models: [A], savedAt: 42 }),
    );
  });

  it('reports the catalogue as unavailable when the request fails and no snapshot exists', async () => {
    const client = clientWith(jest.fn().mockRejectedValue(new Error('offline')));
    const { result } = await renderHook(() => useModelCatalog(client, 'speech', noCache));

    await waitFor(() => expect(result.current.state.status).toBe('unavailable'));
    expect(result.current.refreshing).toBe(false);
  });
});
