// Public, keyless reads of OpenRouter's catalogue (brief C1). Only GET requests to the two documented
// free endpoints are made here: `/models?output_modalities=...` and `/models/<id>/endpoints`.
// Requests run one after another, with a pause between them, and identify the tool in the
// User-Agent. No API key is read or sent.

export const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
export const USER_AGENT = 'Lectio-contract-check/1.0 (public catalogue read, no key)';
export const REQUEST_GAP_MS = 200;

/** Raised when a public read fails for a reason other than a verdict: network, HTTP error, bad JSON. */
export class OpenRouterUnreachableError extends Error {
  constructor(message, { status = null } = {}) {
    super(message);
    this.name = 'OpenRouterUnreachableError';
    this.status = status;
  }
}

/**
 * Creates a sequential GET reader. `fetchImpl` and `sleep` are injectable so tests never touch the
 * network. A 404 on `/endpoints` is returned as `null` (the model has no endpoints, which is a
 * verdict), not thrown.
 */
export function createPublicReader({
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  gapMs = REQUEST_GAP_MS,
  baseUrl = OPENROUTER_API_BASE,
} = {}) {
  let started = false;

  async function getJson(path, { allowNotFound = false } = {}) {
    if (started) await sleep(gapMs);
    started = true;
    let res;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown error';
      throw new OpenRouterUnreachableError(`could not reach OpenRouter (${detail})`);
    }
    if (allowNotFound && res.status === 404) return null;
    if (!res.ok) {
      throw new OpenRouterUnreachableError(`OpenRouter answered HTTP ${res.status} for ${path}`, {
        status: res.status,
      });
    }
    try {
      return await res.json();
    } catch {
      throw new OpenRouterUnreachableError(`OpenRouter sent a body that is not JSON for ${path}`);
    }
  }

  return {
    /** Raw `data` array of `/models?output_modalities=<modality>`. */
    async listModels(modality) {
      const json = await getJson(`/models?output_modalities=${encodeURIComponent(modality)}`);
      if (!Array.isArray(json?.data)) {
        throw new OpenRouterUnreachableError(`OpenRouter sent no model list for ${modality}`);
      }
      return json.data;
    },
    /** `data.endpoints` of `/models/<id>/endpoints`, or null when the model is unknown (404). */
    async listEndpoints(modelId) {
      const json = await getJson(`/models/${modelId}/endpoints`, { allowNotFound: true });
      if (json === null) return null;
      if (!Array.isArray(json?.data?.endpoints)) {
        throw new OpenRouterUnreachableError(`OpenRouter sent no endpoint list for ${modelId}`);
      }
      return json.data.endpoints;
    },
  };
}
