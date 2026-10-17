// Offline tests for the contract rules (brief C1). Run with `npm run sounds:test`, which runs every
// node test script in scripts/sounds and scripts/contract.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildRows, summarize, trimEndpoints } from './check.mjs';
import * as rules from './rules.mjs';

const fixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));

const HAIKU = 'anthropic/claude-haiku-5.5';
const haikuEndpoints = trimEndpoints(
  fixture('anthropic-claude-haiku-5.5.endpoints.json').endpoints,
);
const nanoEndpoints = trimEndpoints(fixture('openai-gpt-5-nano.endpoints.json').endpoints);

const SCHEMA = { type: 'json_schema', json_schema: { name: 'x', strict: true, schema: {} } };
const requireParams = { require_parameters: true };

/** The body the app builds for a structured call, with `extra` added (sampling hints, max_tokens). */
function structuredBody(extra = {}) {
  return {
    model: HAIKU,
    messages: [{ role: 'user', content: 'hi' }],
    response_format: SCHEMA,
    provider: requireParams,
    usage: { include: true },
    ...extra,
  };
}

describe('parametersOf', () => {
  it('drops transport envelope fields and keeps every routing parameter', () => {
    const body = structuredBody({ seed: 1, max_tokens: 5, plugins: [] });
    assert.deepEqual(rules.parametersOf(body).sort(), ['max_tokens', 'response_format', 'seed']);
  });
});

describe('structuredCallVerdict', () => {
  it('passes the body the app sends after the incident-4 fix (response_format only)', () => {
    const verdict = rules.structuredCallVerdict({
      endpoints: haikuEndpoints,
      body: structuredBody(),
    });
    assert.equal(verdict.status, 'OK');
    assert.match(verdict.reason, /10 of 10 endpoints/);
  });

  it('FAILs the incident-4 request: seed with require_parameters on claude-haiku-5.5', () => {
    const verdict = rules.structuredCallVerdict({
      endpoints: haikuEndpoints,
      body: structuredBody({ seed: 1017 }),
    });
    assert.equal(verdict.status, 'FAIL');
    assert.match(verdict.reason, /no endpoint accepts all of \[response_format, seed\]/);
    assert.match(verdict.reason, /lacks \[seed\]/);
  });

  it('FAILs temperature with require_parameters as well', () => {
    const verdict = rules.structuredCallVerdict({
      endpoints: haikuEndpoints,
      body: structuredBody({ temperature: 0 }),
    });
    assert.equal(verdict.status, 'FAIL');
    assert.match(verdict.reason, /lacks \[temperature\]/);
  });

  it('OKs sampling hints when require_parameters is not sent (any endpoint may serve it)', () => {
    const body = structuredBody({ seed: 1017, temperature: 0 });
    delete body.provider;
    const verdict = rules.structuredCallVerdict({ endpoints: haikuEndpoints, body });
    assert.equal(verdict.status, 'OK');
  });

  it('OKs max_tokens with response_format on claude-haiku-5.5', () => {
    const verdict = rules.structuredCallVerdict({
      endpoints: haikuEndpoints,
      body: structuredBody({ max_tokens: 300 }),
    });
    assert.equal(verdict.status, 'OK');
  });

  it('OKs when only some endpoints take every parameter, as long as one does', () => {
    // gpt-5-nano's azure endpoints take max_completion_tokens instead of max_tokens; openai's take both.
    const verdict = rules.structuredCallVerdict({
      endpoints: nanoEndpoints,
      body: structuredBody({ model: 'openai/gpt-5-nano', max_tokens: 50 }),
    });
    assert.equal(verdict.status, 'OK');
    assert.match(verdict.reason, /accept all of \[response_format, max_tokens\]/);
  });

  it('FAILs when no single endpoint takes every parameter, and names the closest one', () => {
    const endpoints = [
      { tag: 'a', supported: ['response_format'] },
      { tag: 'b', supported: ['response_format', 'seed', 'max_tokens'] },
      { tag: 'c', supported: ['max_tokens', 'seed'] },
    ];
    const body = structuredBody({ seed: 1, max_tokens: 9 });
    assert.equal(
      rules.structuredCallVerdict({ endpoints, body }).status,
      'OK',
      'endpoint b takes all three',
    );
    // Without endpoint b, only a accepts structured output, and it lacks both sampling-side fields.
    const withoutB = [endpoints[0], endpoints[2]];
    const tight = rules.structuredCallVerdict({ endpoints: withoutB, body });
    assert.equal(tight.status, 'FAIL');
    assert.match(tight.reason, /closest is a, which lacks \[seed, max_tokens\]/);
  });

  it('FAILs when the model lists no endpoints at all', () => {
    const verdict = rules.structuredCallVerdict({ endpoints: [], body: structuredBody() });
    assert.equal(verdict.status, 'FAIL');
    assert.match(verdict.reason, /lists no endpoints/);
  });

  it('FAILs when no endpoint accepts structured output', () => {
    const verdict = rules.structuredCallVerdict({
      endpoints: [{ tag: 'plain', supported: ['max_tokens'] }],
      body: structuredBody(),
    });
    assert.equal(verdict.status, 'FAIL');
    assert.match(verdict.reason, /no endpoint accepts structured output/);
  });

  it('OKs a JSON-only prompt, which sends no response_format', () => {
    const body = structuredBody();
    delete body.response_format;
    assert.equal(rules.structuredCallVerdict({ endpoints: [], body }).status, 'OK');
  });
});

const SPEECH = 'google/gemini-3.8-flash-lite-tts';
const speechBody = (extra = {}) => ({ model: SPEECH, input: 'Hello.', ...extra });
const speechArgs = (extra = {}) => ({
  modelId: SPEECH,
  listed: true,
  endpointCount: 2,
  voices: ['Kore', 'Puck'],
  supportsStyle: true,
  body: speechBody({ voice: 'Kore', speed: 1, instructions: 'Warm.' }),
  ...extra,
});

describe('speechCallVerdict', () => {
  it('OKs a narrator call with a listed voice, style and default speed', () => {
    const verdict = rules.speechCallVerdict(speechArgs());
    assert.equal(verdict.status, 'OK', verdict.reason);
  });

  it('FAILs a voice that the model does not list', () => {
    const verdict = rules.speechCallVerdict(speechArgs({ body: speechBody({ voice: 'Nope' }) }));
    assert.equal(verdict.status, 'FAIL');
    assert.match(verdict.reason, /"Nope" is not in supported_voices/);
  });

  it('FAILs a missing voice when the model lists voices', () => {
    const verdict = rules.speechCallVerdict(speechArgs({ body: speechBody({ speed: 1 }) }));
    assert.equal(verdict.status, 'FAIL');
    assert.match(verdict.reason, /no voice sent, but the model lists 2 voices/);
  });

  it('OKs a voiceless model with no voice, and FAILs one that is sent a voice', () => {
    const none = rules.speechCallVerdict(
      speechArgs({ voices: [], body: speechBody({ speed: 1 }) }),
    );
    assert.equal(none.status, 'OK', none.reason);
    const sent = rules.speechCallVerdict(
      speechArgs({ voices: [], body: speechBody({ voice: 'Kore' }) }),
    );
    assert.equal(sent.status, 'FAIL');
    assert.match(sent.reason, /takes no voice/);
  });

  it('FAILs instructions sent to a model that does not follow them', () => {
    const verdict = rules.speechCallVerdict(speechArgs({ supportsStyle: false }));
    assert.equal(verdict.status, 'FAIL');
    assert.match(verdict.reason, /does not follow them/);
  });

  it('OKs a model without instructions when it does not take them', () => {
    const verdict = rules.speechCallVerdict(
      speechArgs({ supportsStyle: false, body: speechBody({ voice: 'Kore', speed: 1 }) }),
    );
    assert.equal(verdict.status, 'OK', verdict.reason);
  });

  it('FAILs speed outside the documented 0.25 to 4 range, and passes 1', () => {
    assert.equal(
      rules.speechCallVerdict(speechArgs({ body: speechBody({ voice: 'Kore', speed: 5 }) })).status,
      'FAIL',
    );
    assert.equal(
      rules.speechCallVerdict(speechArgs({ body: speechBody({ voice: 'Kore', speed: 1 }) })).status,
      'OK',
    );
  });

  it('FAILs an unlisted or unserved model, and a body that names another model', () => {
    const unlisted = rules.speechCallVerdict(speechArgs({ listed: false }));
    assert.match(unlisted.reason, /not listed as a narratable speech model/);
    const unserved = rules.speechCallVerdict(speechArgs({ endpointCount: 0 }));
    assert.match(unserved.reason, /no provider serves this model/);
    const wrong = rules.speechCallVerdict(
      speechArgs({ body: speechBody({ model: 'x/y', voice: 'Kore' }) }),
    );
    assert.match(wrong.reason, /request names x\/y/);
  });
});

describe('pricingVerdict', () => {
  const raw = (prompt, completion) => ({ pricing: { prompt, completion } });

  it('OKs prices that are numeric strings, including zero and exponent form', () => {
    assert.equal(rules.pricingVerdict(raw('0.0000001', '0.0000005')).status, 'OK');
    assert.equal(rules.pricingVerdict(raw('0', '0')).status, 'OK');
    assert.equal(rules.pricingVerdict(raw('1e-7', '0.000006')).status, 'OK');
  });

  it('FAILs a missing, empty or non-numeric price', () => {
    const missing = rules.pricingVerdict({ pricing: { completion: '0' } });
    assert.match(missing.reason, /pricing\.prompt is missing/);
    assert.match(rules.pricingVerdict(raw('free', '0')).reason, /pricing\.prompt/);
    assert.match(rules.pricingVerdict(raw('', '0')).reason, /pricing\.prompt/);
    assert.match(rules.pricingVerdict(undefined).reason, /pricing\.prompt is missing/);
  });
});

describe('textListedVerdict', () => {
  it('reports the listing result', () => {
    assert.equal(rules.textListedVerdict({ listed: true }).status, 'OK');
    assert.equal(rules.textListedVerdict({ listed: false }).status, 'FAIL');
  });
});

describe('buildRows and summarize', () => {
  const rawText = [
    {
      id: HAIKU,
      architecture: { output_modalities: ['text'] },
      pricing: { prompt: '0.0000001', completion: '0.0000005' },
    },
  ];
  const rawSpeech = [{ id: SPEECH, pricing: { prompt: '0.0000005', completion: '0.000006' } }];
  const plan = {
    textModelIds: [HAIKU],
    speechTargets: [{ modelId: SPEECH, source: 'narrator', langs: ['en'], option: null }],
  };
  const endpointsById = new Map([
    [HAIKU, fixture('anthropic-claude-haiku-5.5.endpoints.json').endpoints],
    [SPEECH, [{ tag: 'google-ai-studio' }]],
  ]);
  const structured = (body) => [{ call: 'analyze', model: HAIKU, bodies: [body] }];
  const speech = [
    {
      modelId: SPEECH,
      source: 'narrator',
      lang: 'en',
      body: speechBody({ voice: 'Kore', speed: 1, instructions: 'Warm.' }),
      voices: ['Kore'],
      listed: true,
      narratable: true,
      supportsStyle: true,
    },
  ];

  it('is all OK for the body the app sends today', () => {
    const rows = buildRows({
      plan,
      rawText,
      rawSpeech,
      endpointsById,
      captured: { structured: structured(structuredBody()), speech },
    });
    assert.deepEqual(summarize(rows), { total: 5, failed: 0, passed: 5, ok: true });
  });

  it('turns the incident-4 body into a FAIL row and a failing summary', () => {
    const rows = buildRows({
      plan,
      rawText,
      rawSpeech,
      endpointsById,
      captured: { structured: structured(structuredBody({ seed: 1017 })), speech },
    });
    const failed = rows.filter((row) => row.status === 'FAIL');
    assert.equal(failed.length, 1);
    assert.equal(failed[0].call, 'structured: analyze');
    assert.equal(summarize(rows).ok, false);
  });
});
