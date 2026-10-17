// Pure verdict rules for the OpenRouter contract check (brief C1). No I/O and no app imports, so
// every rule is tested offline against fixtures in rules.test.mjs. Inputs come from the live
// `/endpoints` and `/models` data and from the request bodies the app really builds.

/**
 * Body fields that are transport envelope, not request parameters. OpenRouter does not match them
 * against `supported_parameters`, so they never narrow routing. Everything else in a body is a
 * parameter, and under `provider.require_parameters` every one of them must be supported.
 */
export const ENVELOPE_FIELDS = new Set(['model', 'messages', 'provider', 'usage', 'plugins']);

/** The documented speech `speed` range (OpenRouter /audio/speech: 0.25 to 4.0). */
export const SPEED_RANGE = { min: 0.25, max: 4 };

const PRICE_PATTERN = /^\d+(\.\d+)?(e-?\d+)?$/i;

/** The parameter names a request body carries, envelope fields removed. */
export function parametersOf(body) {
  return Object.keys(body).filter((key) => !ENVELOPE_FIELDS.has(key));
}

function verdict(problems, okReason) {
  return problems.length === 0
    ? { status: 'OK', reason: okReason }
    : { status: 'FAIL', reason: problems.join('; ') };
}

/**
 * A structured-output call with `require_parameters`. OpenRouter routes it only to an endpoint that
 * accepts every parameter in the body, so the rule is: at least one endpoint accepts structured
 * output (`response_format` or `structured_outputs`) AND accepts every other parameter sent. The
 * incident-4 class (sampling hints sent with require_parameters) fails here, because no endpoint of
 * claude-haiku-5.5 lists `seed` or `temperature`.
 *
 * `endpoints` is the `data.endpoints` array of GET /models/<id>/endpoints, trimmed to
 * `{ tag, supported }` where `supported` is its `supported_parameters`.
 */
export function structuredCallVerdict({ endpoints, body }) {
  if (body.provider?.require_parameters !== true) {
    return {
      status: 'OK',
      reason: 'no require_parameters, so OpenRouter may route to any endpoint',
    };
  }
  const params = parametersOf(body);
  if (!params.includes('response_format')) {
    return { status: 'OK', reason: 'JSON-only prompt, no response_format sent' };
  }
  if (endpoints.length === 0) {
    return { status: 'FAIL', reason: 'OpenRouter lists no endpoints for this model' };
  }
  const schemaEndpoints = endpoints.filter(
    (ep) => ep.supported.includes('response_format') || ep.supported.includes('structured_outputs'),
  );
  if (schemaEndpoints.length === 0) {
    return { status: 'FAIL', reason: 'no endpoint accepts structured output' };
  }
  const acceptsAll = schemaEndpoints.filter((ep) => params.every((p) => ep.supported.includes(p)));
  if (acceptsAll.length > 0) {
    return {
      status: 'OK',
      reason: `${acceptsAll.length} of ${endpoints.length} endpoints accept all of [${params.join(', ')}]`,
    };
  }
  const closest = schemaEndpoints
    .map((ep) => ({ ep, missing: params.filter((p) => !ep.supported.includes(p)) }))
    .sort((a, b) => a.missing.length - b.missing.length)[0];
  return {
    status: 'FAIL',
    reason:
      `no endpoint accepts all of [${params.join(', ')}] with require_parameters; ` +
      `closest is ${closest.ep.tag}, which lacks [${closest.missing.join(', ')}]`,
  };
}

/**
 * One speech call, judged from the catalogue entry and the body the app sends.
 *
 * - `listed`: the model is in the live speech catalogue with `speech` output (and is narratable).
 * - `endpointCount`: how many providers serve it. Zero means nobody can answer the call.
 * - `voices`: the model's `supported_voices`, empty when it takes none.
 * - `supportsStyle`: capabilities.supportsStyleInstructions for this model.
 */
export function speechCallVerdict({ modelId, listed, endpointCount, voices, supportsStyle, body }) {
  const problems = [];
  if (!listed) problems.push('not listed as a narratable speech model');
  if (endpointCount === 0) problems.push('no provider serves this model');
  if (body.model !== modelId) problems.push(`request names ${String(body.model)}`);
  if (typeof body.input !== 'string' || body.input.trim() === '') {
    problems.push('request has no input text');
  }

  if (voices.length > 0) {
    if (body.voice === undefined) {
      problems.push(`no voice sent, but the model lists ${voices.length} voices`);
    } else if (!voices.includes(body.voice)) {
      problems.push(`voice "${body.voice}" is not in supported_voices`);
    }
  } else if (body.voice !== undefined) {
    problems.push(`sends voice "${body.voice}", but the model takes no voice`);
  }

  if (body.instructions !== undefined && !supportsStyle) {
    problems.push('sends instructions to a model that does not follow them');
  }

  if (body.speed !== undefined) {
    const inRange =
      Number.isFinite(body.speed) && body.speed >= SPEED_RANGE.min && body.speed <= SPEED_RANGE.max;
    if (!inRange)
      problems.push(
        `speed ${String(body.speed)} is outside ${SPEED_RANGE.min}..${SPEED_RANGE.max}`,
      );
  }

  const voiceNote =
    voices.length > 0 ? `voice ${String(body.voice)}` : 'no voice (model takes none)';
  const styleNote = body.instructions === undefined ? 'no style' : 'style sent';
  const speedNote = body.speed === undefined ? 'speed omitted' : `speed ${body.speed}`;
  return verdict(problems, `served by ${endpointCount}; ${voiceNote}; ${styleNote}; ${speedNote}`);
}

/**
 * Pricing must be present and parseable on the raw catalogue entry, because cost estimates read
 * it. The app's own parser defaults a missing price to 0, so this reads the raw strings.
 */
export function pricingVerdict(rawModel) {
  const pricing = rawModel?.pricing ?? {};
  const problems = ['prompt', 'completion']
    .filter((field) => typeof pricing[field] !== 'string' || !PRICE_PATTERN.test(pricing[field]))
    .map((field) => `pricing.${field} is missing or not a number`);
  return verdict(
    problems,
    `prompt ${String(pricing.prompt)}, completion ${String(pricing.completion)} per unit`,
  );
}

/** Whether the live text catalogue lists the model with text output. */
export function textListedVerdict({ listed }) {
  return listed
    ? { status: 'OK', reason: 'listed with text output' }
    : { status: 'FAIL', reason: 'not listed in the live text catalogue' };
}
