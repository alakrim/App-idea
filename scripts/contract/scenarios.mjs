// Captures the request bodies the app really sends (brief C1). Each call goes through the app's own
// code, the OpenRouter client, the LLM port, the analysis engine and the TTS adapter, with a
// recording `fetch` in place of the network. The recorder answers the two catalogue GETs from the
// live data already read, and it refuses every other request. So the only bodies that exist are the
// ones the app would post, and no request leaves the process. No API key is used: the placeholder
// below is never sent, because the recorder replaces `fetch`.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadTs } from './ts-loader.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const OFFLINE_PLACEHOLDER_KEY = 'offline-recorder-never-sent';
const SAMPLE_TEXT = 'The lamp burned low while the narrator read the first page aloud.';

let appCache = null;

/** The app modules this check drives, loaded once from source. */
export function loadApp() {
  if (appCache !== null) return appCache;
  appCache = {
    defaults: loadTs('src/core/defaults.ts'),
    client: loadTs('src/services/openrouter/index.ts'),
    models: loadTs('src/services/openrouter/models.ts'),
    llmPort: loadTs('src/services/pipeline/adapters/llm-port.ts'),
    analysis: loadTs('src/core/analysis/analysis-call.ts'),
    translateSchemas: loadTs('src/core/translate/schemas.ts'),
    selectionSchema: loadTs('src/core/extract/select.ts').selectionSchema,
    // The same zod instance the app's CommonJS modules load, so schemas from both sides agree.
    z: createRequire(import.meta.url)('zod'),
    vocabPrompts: loadTs('src/core/vocab/prompts.ts'),
    narrationOptions: loadTs('src/core/narration/options.ts'),
    capabilities: loadTs('src/core/narration/capabilities.ts'),
    narrationChoices: loadTs('src/features/settings/narration-choices.ts'),
    narrationId: loadTs('src/services/pipeline/narration-id.ts'),
    tts: loadTs('src/services/pipeline/adapters/tts.ts'),
  };
  return appCache;
}

/**
 * A numeric `const` read from a source file. Used only for the vocab call's sampling and token cap,
 * which are module-private in the app. A missing constant is an error, never a silent default.
 */
export function readNumericConstant(repoRelativePath, name) {
  const text = readFileSync(join(REPO, repoRelativePath), 'utf8');
  const match = new RegExp(`^const ${name} = ([0-9.]+);`, 'm').exec(text);
  if (match === null) throw new Error(`${name} not found in ${repoRelativePath}`);
  return Number(match[1]);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * A fetch stand-in. GET /models is answered from `catalogs` (the live data). POST chat and speech
 * bodies are recorded and answered with a canned reply. Anything else throws, so a new endpoint in
 * the app shows up as a failed capture rather than a silent network call.
 */
export function createRecorder(catalogs) {
  const posts = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    if (method === 'GET' && url.pathname === '/api/v1/models') {
      const data = catalogs[url.searchParams.get('output_modalities') ?? ''];
      return data === undefined
        ? jsonResponse({ error: 'unknown modality' }, 400)
        : jsonResponse({ data });
    }
    if (method === 'POST' && url.pathname === '/api/v1/chat/completions') {
      const body = JSON.parse(String(init.body));
      posts.push({ path: 'chat/completions', body });
      return jsonResponse({
        id: 'offline-recorder',
        model: body.model,
        choices: [{ message: { content: '{}' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 },
      });
    }
    if (method === 'POST' && url.pathname === '/api/v1/audio/speech') {
      posts.push({ path: 'audio/speech', body: JSON.parse(String(init.body)) });
      return new Response(new Uint8Array([0, 0, 0, 0]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    }
    throw new Error(`offline recorder refused ${method} ${url.pathname}`);
  };
  return { fetchImpl, posts };
}

function offlineClient(app, catalogs) {
  const recorder = createRecorder(catalogs);
  const client = app.client.createOpenRouterClient({
    getApiKey: async () => OFFLINE_PLACEHOLDER_KEY,
    appUrl: 'https://github.com/lectio-app',
    appTitle: 'Lectio contract check',
    fetchImpl: recorder.fetchImpl,
    sleep: async () => {},
    maxRetries: 0,
  });
  return { client, recorder };
}

/** The speech model ids the check covers: the three narrators, then the five newest others. */
export function planModels({ rawSpeech }) {
  const app = loadApp();
  const speech = app.models.parseModelItems(rawSpeech);
  const narrators = app.narrationOptions.NARRATOR_OPTIONS;
  const narratorIds = new Set(narrators.map((option) => option.modelId));
  const newest = app.narrationChoices
    .arrangeSpeechModels(app.narrationChoices.narratableModels(speech))
    .filter((model) => !narratorIds.has(model.id))
    .slice(0, 5);
  const speechTargets = [
    ...narrators.map((option) => ({
      modelId: option.modelId,
      source: 'narrator',
      langs: Array.isArray(option.languages) ? [...option.languages] : ['en'],
      option,
    })),
    ...newest.map((model) => ({
      modelId: model.id,
      source: 'newest',
      langs: ['en'],
      option: null,
    })),
  ];
  const textModelIds = [...new Set(Object.values(app.defaults.DEFAULT_MODELS))];
  return { textModelIds, speechTargets };
}

/** Structured-output calls, built by the same code paths the pipeline uses. */
async function captureStructured(app, catalogs) {
  const { DEFAULT_MODELS } = app.defaults;
  const calls = [];
  const run = async (call, model, action) => {
    const { client, recorder } = offlineClient(app, catalogs);
    try {
      await action(client, app.llmPort.createLlmPort({ openrouter: client }).transportFor(model));
    } catch (error) {
      // An unparsable '{}' reply is expected: the body was already recorded before the reply was read.
      if (!isExpectedReplyFailure(app, error)) throw error;
    }
    const bodies = recorder.posts.filter((p) => p.path === 'chat/completions').map((p) => p.body);
    if (bodies.length === 0) throw new Error(`no ${call} request was captured for ${model}`);
    calls.push({ call, model, bodies });
  };

  await run('translate', DEFAULT_MODELS.translation, (_client, transport) =>
    transport({
      system: 'Translate the sentences.',
      user: 'Hello.',
      jsonSchema: app.translateSchemas.TRANSLATE_JSON_SCHEMA,
      cacheSystem: true,
    }),
  );
  await run('analyze', DEFAULT_MODELS.analysis, (_client, transport) =>
    app.analysis.runAnalysisCall(transport, { system: 'Analyse the chapter.', user: 'Text.' }),
  );
  await run('cleanup', DEFAULT_MODELS.cleanup, (_client, transport) =>
    transport({
      system: 'Keep the main content blocks.',
      user: 'Blocks.',
      jsonSchema: cleanupSchemaSpec(app),
    }),
  );
  await run('vocab', DEFAULT_MODELS.analysis, (client) =>
    client.chatJson({
      model: DEFAULT_MODELS.analysis,
      system: 'Explain the term.',
      user: 'Term.',
      schema: app.vocabPrompts.VocabExplanationSchema,
      jsonSchemaName: app.vocabPrompts.VOCAB_JSON_SCHEMA_NAME,
      temperature: readNumericConstant(
        'src/features/vocab/vocab-actions.ts',
        'EXPLAIN_TEMPERATURE',
      ),
      maxTokens: readNumericConstant('src/features/vocab/vocab-actions.ts', 'EXPLAIN_MAX_TOKENS'),
    }),
  );
  return calls;
}

/**
 * The cleanup call's schema, which web-extract.ts builds from `selectionSchema`. That module pulls in
 * the extraction stack (defuddle's `/node` export is ESM-only, so it cannot load here), so the same
 * two lines are rebuilt from the schema. A source assertion keeps them in step with the app: if the
 * app changes that line, the check stops with exit 3 instead of judging a body the app no longer sends.
 */
function cleanupSchemaSpec(app) {
  const source = readFileSync(join(REPO, 'src/core/pipeline/stages/web-extract.ts'), 'utf8');
  const expected = [
    "name: 'index_selection'",
    "z.toJSONSchema(selectionSchema, { io: 'output', reused: 'inline' })",
  ];
  for (const fragment of expected) {
    if (!source.includes(fragment)) {
      throw new Error(
        `SELECTION_JSON_SCHEMA changed in web-extract.ts (missing ${fragment}); update scenarios.mjs`,
      );
    }
  }
  return {
    name: 'index_selection',
    schema: app.z.toJSONSchema(app.selectionSchema, { io: 'output', reused: 'inline' }),
  };
}

function isExpectedReplyFailure(app, error) {
  if (error instanceof app.analysis.AnalysisOutputError) return true;
  return typeof error === 'object' && error !== null && error.error?.code === 'LLM_INVALID_OUTPUT';
}

/** Speech calls, built by the settings rules and the narration TTS adapter the app uses. */
async function captureSpeech(app, catalogs, plan) {
  const speech = app.models.parseModelItems(catalogs.speech);
  const { DEFAULT_NARRATION } = app.defaults;
  const current = { ...DEFAULT_NARRATION };
  const captures = [];
  for (const target of plan.speechTargets) {
    const model = speech.find((candidate) => candidate.id === target.modelId);
    for (const lang of target.langs) {
      const voices = model?.supportedVoices ?? [];
      const settings = target.option
        ? app.narrationChoices.narrationForOption(current, target.option, lang, voices)
        : app.narrationChoices.narrationForModel(
            current,
            model ?? { id: target.modelId, supportedVoices: [], supportedParameters: [] },
            lang,
          );
      const { client, recorder } = offlineClient(app, catalogs);
      const tts = app.tts.createTts({ openrouter: client });
      await tts.synthesize({
        text: SAMPLE_TEXT,
        profile: app.narrationId.narrationProfileFor(settings),
        signal: undefined,
      });
      const body = recorder.posts.find((p) => p.path === 'audio/speech')?.body;
      if (body === undefined)
        throw new Error(`no speech request was captured for ${target.modelId}`);
      captures.push({
        modelId: target.modelId,
        source: target.source,
        lang,
        body,
        voices,
        listed: model !== undefined,
        narratable: model !== undefined && app.capabilities.isNarratableModel(model),
        supportsStyle: app.capabilities.supportsStyleInstructions({
          id: target.modelId,
          supportedParameters: model?.supportedParameters ?? [],
        }),
      });
    }
  }
  return captures;
}

/** Runs every captured call through the app's own builders, offline. */
export async function captureRequests({ rawText, rawSpeech }, plan) {
  const app = loadApp();
  const catalogs = { text: rawText, speech: rawSpeech };
  const structured = await captureStructured(app, catalogs);
  const speech = await captureSpeech(app, catalogs, plan);
  return { structured, speech, parsedText: app.models.parseModelItems(rawText) };
}
