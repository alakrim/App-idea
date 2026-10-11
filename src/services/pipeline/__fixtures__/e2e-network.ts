/*
 * A fake network for the end-to-end test: one fetch implementation that serves the article page,
 * the OpenRouter catalog, structured chat replies and speech. Every call is recorded. No request
 * leaves the process, and the replies are canned, so no paid call can happen.
 */
import { chatReply, jsonResponse } from '@/services/openrouter/__fixtures__/fake-fetch';

export const PAGE_URL = 'https://news.example.com/book/harbour-storm';
export const CLEANUP_MODEL = 'openai/gpt-5-nano';
export const ANALYSIS_MODEL = 'anthropic/claude-haiku-5.5';
export const TRANSLATION_MODEL = 'anthropic/claude-haiku-5.5';
export const NARRATION_MODEL = 'google/gemini-3.8-flash-lite-tts';

const PASSAGE_HEADER = 'Passage (return one item for each idx below):';
const COST = { analysis: 0.0021, translation: 0.0034, speech: 0.0008 };

/** One MPEG-1 Layer III frame at 128 kbit/s and 44.1 kHz, repeated: a valid CBR stream. */
export function mp3Bytes(frames: number): Uint8Array {
  const frameLength = 417;
  const bytes = new Uint8Array(new ArrayBuffer(frameLength * frames));
  for (let i = 0; i < frames; i += 1) {
    const at = i * frameLength;
    bytes[at] = 0xff;
    bytes[at + 1] = 0xfb;
    bytes[at + 2] = 0x90;
    bytes[at + 3] = 0x00;
  }
  return bytes;
}

/** Raw 16-bit little-endian mono PCM at 24 kHz, as Gemini TTS returns it: `samples` of silence. */
export function pcmBytes(samples: number): Uint8Array {
  return new Uint8Array(new ArrayBuffer(samples * 2));
}

export interface NetworkCall {
  readonly method: string;
  readonly path: string;
  readonly body: Record<string, unknown> | undefined;
}

export interface Network {
  readonly fetchImpl: typeof fetch;
  /** The HTML every article page returns. A test can swap it for another page. */
  pageHtml: string;
  readonly calls: NetworkCall[];
  /** The URLs of the article pages that were fetched. */
  readonly pageRequests: string[];
  /** The text the PDF parser returns, per engine. An empty string is a scanned document. */
  pdfTextByEngine: Record<string, string>;
  /** The engines the PDF parser was asked for, in order. */
  readonly pdfEngines: string[];
  /**
   * Speech calls after the first `afterCalls` wait until their request is aborted. Null means every
   * call answers at once.
   */
  holdSpeech: { afterCalls: number } | null;
  countOf(path: string): number;
  speechCount(): number;
}

const MODELS = [
  { id: CLEANUP_MODEL, text: true, structured: true },
  { id: ANALYSIS_MODEL, text: true, structured: true },
  { id: NARRATION_MODEL, text: false, structured: false },
];

function catalogReply(modality: string): Response {
  return jsonResponse({
    data: MODELS.filter((m) => (modality === 'speech' ? !m.text : m.text)).map((m) => ({
      id: m.id,
      name: m.id,
      pricing: m.text
        ? { prompt: '0.0000002', completion: '0.0000008' }
        : { prompt: '0.00000002', completion: '0' },
      architecture: {
        input_modalities: ['text'],
        output_modalities: m.text ? ['text'] : ['audio'],
      },
      supported_parameters: m.structured ? ['structured_outputs', 'response_format'] : [],
      supported_voices: m.text ? undefined : ['Kore', 'Puck'],
    })),
  });
}

/** The analysis reply: a memory card, and one ambience cue over the opening sentences. */
function analysisReply(): string {
  return JSON.stringify({
    memory: {
      summary: 'A storm reaches the harbour town, and the lantern keeper holds the night.',
      keyEvents: ['The storm breaks over the harbour'],
      characters: [
        {
          name: 'Mara Quill',
          aliases: ['Quill'],
          role: 'Harbourmaster',
          facts: ['Keeps the lantern lit through the storm'],
        },
      ],
      places: [{ name: 'Harbour', facts: ['Floods first in a storm'] }],
      items: [],
      relationships: [],
      openThreads: ['Whether the breakwater holds'],
      glossary: [{ term: 'Harbour', translation: null, note: null }],
    },
    cues: [
      {
        category: 'light_rain',
        startSentence: 0,
        endSentence: 6,
        intensity: 'medium',
        confidence: 0.9,
        reason: 'Rain on the harbour stones.',
      },
    ],
  });
}

/** Translates every sentence listed after the passage header, tagged so the test can see it. */
function translationReply(userText: string): string {
  const passage = userText.slice(userText.indexOf(PASSAGE_HEADER) + PASSAGE_HEADER.length);
  const items = [...passage.matchAll(/^\[(\d+)\] (.*)$/gmu)].map((match) => ({
    idx: Number(match[1]),
    text: `IT: ${match[2] ?? ''}`,
  }));
  return JSON.stringify({ items });
}

export function createNetwork(pageHtml: string): Network {
  const calls: NetworkCall[] = [];
  const pageRequests: string[] = [];
  const pdfEngines: string[] = [];
  let speechCalls = 0;
  const network: Network = {
    calls,
    pageHtml,
    pageRequests,
    pdfEngines,
    pdfTextByEngine: {},
    holdSpeech: null,
    fetchImpl: (input: string | URL | Request, init?: RequestInit) => serve(input, init),
    countOf: (path) => calls.filter((call) => call.path === path).length,
    speechCount: () => speechCalls,
  };

  const serve = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    if (url.hostname !== 'openrouter.ai') {
      pageRequests.push(url.toString());
      return new Response(network.pageHtml, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    const path = url.pathname.replace(/^\/api\/v1/u, '');
    calls.push({ method, path, body });

    if (path === '/models') {
      return catalogReply(url.searchParams.get('output_modalities') ?? 'text');
    }
    if (path === '/chat/completions' && Array.isArray(body?.plugins)) {
      const engine = (body?.plugins as { pdf: { engine: string } }[])[0]?.pdf.engine ?? '';
      pdfEngines.push(engine);
      const text = network.pdfTextByEngine[engine] ?? '';
      const annotations =
        text === ''
          ? []
          : [{ type: 'file', file: { hash: 'pdf-1', content: [{ type: 'text', text }] } }];
      return chatReply('OK', { cost: 0.0001, annotations });
    }
    if (path === '/chat/completions') {
      const format = body?.response_format as { json_schema?: { name: string } } | undefined;
      const messages = (body?.messages ?? []) as { content: string }[];
      const userText = messages[messages.length - 1]?.content ?? '';
      switch (format?.json_schema?.name) {
        case 'chapter_analysis':
          return chatReply(analysisReply(), { cost: COST.analysis });
        case 'chapter_translation':
          return chatReply(translationReply(userText), { cost: COST.translation });
        default:
          return jsonResponse({ error: { message: 'unmocked chat call' } }, { status: 400 });
      }
    }
    if (path === '/audio/speech') {
      speechCalls += 1;
      const hold = network.holdSpeech;
      if (hold && speechCalls > hold.afterCalls) {
        await new Promise<void>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        });
      }
      const input = String(body?.input ?? '');
      const seconds = Math.max(0.2, input.length / 15);
      // Live behaviour: Gemini TTS refuses mp3 and answers pcm with a rate and channel count.
      const model = String(body?.model ?? '');
      if (/gemini.*tts/i.test(model) && body?.response_format !== 'pcm') {
        return jsonResponse(
          { error: { message: 'Gemini TTS only supports response_format="pcm"' } },
          { status: 400 },
        );
      }
      if (body?.response_format === 'pcm') {
        return new Response(pcmBytes(Math.round(seconds * 24_000)).buffer as ArrayBuffer, {
          headers: { 'content-type': 'audio/pcm;rate=24000;channels=1' },
        });
      }
      const frames = Math.max(2, Math.round(seconds * 38));
      return new Response(mp3Bytes(frames).buffer as ArrayBuffer, {
        headers: { 'content-type': 'audio/mpeg' },
      });
    }
    return new Response('not mocked', { status: 404 });
  };

  return network;
}
