export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  signal: AbortSignal | undefined;
}

export type Route = (call: RecordedCall) => Response | Promise<Response>;

/** A fetch stand-in that records each call and answers it through `route`. No network is used. */
export function createFakeFetch(route: Route): { fetchImpl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: RecordedCall = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      signal: init?.signal ?? undefined,
    };
    calls.push(call);
    return route(call);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

export function errorResponse(
  status: number,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return jsonResponse({ error: { message, code: status } }, { status, headers });
}

/** A chat/completions reply in OpenRouter's shape. */
export function chatReply(
  content: string,
  options: { cost?: number | null; annotations?: unknown[]; id?: string } = {},
): Response {
  return jsonResponse({
    id: options.id ?? 'gen-test-1',
    model: 'test/model',
    choices: [
      {
        message: { role: 'assistant', content, annotations: options.annotations },
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      ...(options.cost === undefined ? {} : { cost: options.cost }),
    },
  });
}

/** Resolves on the next abort of `signal`, rejecting the way fetch does. */
export function hangUntilAborted(call: RecordedCall): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    call.signal?.addEventListener('abort', () => {
      reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
    });
  });
}
