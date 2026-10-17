/*
 * In-memory fakes for every pipeline port. They keep their state in plain objects, so tests can
 * inspect what the pipeline wrote and count what it called. No test touches a database, the
 * network or a file system.
 */
import type { CueReport } from '@/core/analysis/cue-report';
import type { ChapterMemoryRecord, ValidatedCue } from '@/core/analysis/types';
import { DEFAULT_SETTINGS } from '@/core/defaults';
import type {
  AudioSegment,
  Chapter,
  ChapterMemory,
  ChapterSource,
  ChapterStatus,
  Entity,
  EntityFact,
  Id,
  Job,
  NarrationProfile,
  Series,
  Stage,
  UsageEntry,
} from '@/core/domain';
import { FAKE_USAGE, reply } from '@/core/llm/__fixtures__/replies';
import type { LlmReply, LlmRequest, LlmTransport } from '@/core/llm/transport';
import type { Settings } from '@/core/settings';
import type { ChapterText } from '@/core/text/build';

import type {
  CatalogModel,
  ChapterRecord,
  ChapterStore,
  PdfTextResult,
  PersistedQueueItem,
  PipelinePorts,
  StoredSentence,
  TtsResult,
} from '../ports';

export const MODELS = {
  cleanup: 'cleanup/model',
  analysis: 'analysis/model',
  translation: 'translation/model',
  narration: 'narration/model',
} as const;

export const CATALOG: Record<string, CatalogModel> = {
  [MODELS.cleanup]: {
    id: MODELS.cleanup,
    pricing: { prompt: 0.00000005, completion: 0.0000004 },
    supportsStyle: false,
  },
  [MODELS.analysis]: {
    id: MODELS.analysis,
    pricing: { prompt: 0.000001, completion: 0.000005 },
    supportsStyle: false,
  },
  [MODELS.translation]: {
    id: MODELS.translation,
    pricing: { prompt: 0.000001, completion: 0.000005 },
    supportsStyle: false,
  },
  [MODELS.narration]: {
    id: MODELS.narration,
    pricing: { prompt: 0.00001, completion: 0 },
    supportsStyle: true,
  },
};

/** A 26-character ULID-shaped id from a number. */
export function ulid(n: number): Id {
  return String(n).padStart(26, '0');
}

export const SERIES_ID = ulid(1);
export const CHAPTER_ID = ulid(2);
export const NARRATION_ID = ulid(3);

export const DEFAULT_NARRATION: NarrationProfile = {
  id: NARRATION_ID,
  name: 'Narrator',
  provider: 'openrouter',
  model: MODELS.narration,
  voice: 'Kore',
  style: 'Warm audiobook narrator.',
  speed: 1,
};

export const TEST_SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  cleanupModel: MODELS.cleanup,
  analysisModel: MODELS.analysis,
  translationModel: MODELS.translation,
};

export interface FakeOptions {
  readonly source?: ChapterSource;
  readonly title?: string;
  readonly sourceText?: string | null;
  readonly targetLang?: string | null;
  /** Fetched bytes for URL chapters. */
  readonly html?: string;
  /** The WebView render result. */
  readonly rendered?: string;
  /** The PDF parse result. A function receives the engine. */
  readonly pdf?: PdfTextResult | ((engine: string) => PdfTextResult);
  /** Replaces the default model behaviour. Return undefined to fall through to the default. */
  readonly llm?: (
    request: LlmRequest,
    model: string,
  ) => LlmReply | undefined | Promise<LlmReply | undefined>;
  readonly tts?: (text: string, profile: NarrationProfile) => TtsResult | Promise<TtsResult>;
  readonly catalog?: Record<string, CatalogModel>;
  /** Overrides fields of the chapter's narration profile. */
  readonly narration?: Partial<NarrationProfile>;
}

export interface FakeState {
  readonly chapters: Map<Id, Chapter>;
  readonly series: Series;
  settings: Settings;
  narration: NarrationProfile;
  readonly sourceText: Map<Id, string>;
  readonly sentences: Map<Id, StoredSentence[]>;
  readonly memories: Map<Id, ChapterMemory>;
  readonly cues: Map<Id, readonly ValidatedCue[]>;
  readonly cueCache: Map<string, readonly ValidatedCue[]>;
  readonly cueReports: Map<Id, CueReport>;
  readonly entities: Entity[];
  readonly facts: EntityFact[];
  readonly segments: Map<Id, AudioSegment[]>;
  readonly jobs: Map<string, Job>;
  queue: PersistedQueueItem[];
  readonly ledger: UsageEntry[];
  readonly fetched: string[];
  readonly rendered: string[];
  readonly pdfCalls: { engine: string }[];
  readonly ttsCalls: { text: string; style: string | null; voice: string }[];
  readonly llmCalls: { model: string; request: LlmRequest }[];
  readonly written: string[];
  readonly removedAudio: Id[];
}

export interface FakePorts {
  readonly ports: PipelinePorts;
  readonly state: FakeState;
  /** The chapter as the store holds it. */
  chapter(id?: Id): Chapter;
  /** Stage of the job, or undefined when none was written. */
  job(stage: Stage, id?: Id): Job | undefined;
  /** Adds a pasted-text chapter to the same series. */
  addChapter(id: Id, order: number, text: string): void;
}

const T0 = 1_700_000_000_000;

/** Builds the paragraphs and sentences of a chapter as the segment stage would. */
function storedFrom(text: ChapterText): StoredSentence[] {
  return text.sentences.map((s) => ({
    idx: s.idx,
    paragraphIdx: s.paragraphIdx,
    kind: s.kind,
    text: s.text,
    translated: null,
    charCount: s.charCount,
  }));
}

/** A valid MPEG-1 Layer III, 128 kbit/s, 44.1 kHz frame, sized to the payload length. */
export function mp3Bytes(frames: number): Uint8Array {
  const frame = new Uint8Array(417);
  frame.set([0xff, 0xfb, 0x90, 0x00], 0);
  const out = new Uint8Array(frame.length * frames);
  for (let i = 0; i < frames; i += 1) out.set(frame, i * frame.length);
  return out;
}

/** Answers the three structured calls the pipeline makes, from the request's schema name. */
export function defaultReply(request: LlmRequest): LlmReply {
  const name = request.jsonSchema?.name;
  if (name === 'chapter_analysis') {
    return reply(
      JSON.stringify({
        memory: {
          summary: 'The sailor reaches the harbour at dawn.',
          keyEvents: ['Ada reaches the harbour.'],
          characters: [{ name: 'Ada', aliases: [], role: null, facts: ['Is a sailor.'] }],
          places: [],
          items: [],
          relationships: [],
          openThreads: [],
          glossary: [{ term: 'Ada', translation: null, note: null }],
        },
        cues: [],
      }),
    );
  }
  if (name === 'chapter_translation') {
    const items = [...request.user.matchAll(/^\[(\d+)\] (.*)$/gmu)].map((m) => ({
      idx: Number(m[1]),
      text: `EN ${m[2] ?? ''}`,
    }));
    return reply(JSON.stringify({ items }));
  }
  if (name === 'setting_fallback') return reply(JSON.stringify({ cue: null }));
  if (name === 'index_selection') {
    const count = [...request.user.matchAll(/^\[(\d+)\] /gmu)].length;
    return reply(JSON.stringify({ keep: Array.from({ length: count }, (_, i) => i) }));
  }
  return reply('A short reduced summary.');
}

export function createFakePorts(options: FakeOptions = {}): FakePorts {
  const source: ChapterSource = options.source ?? { kind: 'text', label: 'Pasted' };
  const catalog = options.catalog ?? CATALOG;
  let tick = 0;
  let nextId = 100;

  const chapter: Chapter = {
    id: CHAPTER_ID,
    seriesId: SERIES_ID,
    order: 1,
    title: options.title ?? '',
    source,
    sourceLang: null,
    status: 'draft',
    wordCount: null,
    durationMs: null,
    createdAt: T0,
    updatedAt: T0,
  };
  const series: Series = {
    id: SERIES_ID,
    title: 'Test Series',
    coverUri: null,
    coverTint: null,
    sourceLang: null,
    targetLang: options.targetLang === undefined ? 'en' : options.targetLang,
    narrationProfileId: NARRATION_ID,
    createdAt: T0,
    updatedAt: T0,
  };

  const state: FakeState = {
    chapters: new Map([[CHAPTER_ID, chapter]]),
    series,
    settings: TEST_SETTINGS,
    narration: { ...DEFAULT_NARRATION, ...options.narration },
    sourceText: new Map(),
    sentences: new Map(),
    memories: new Map(),
    cues: new Map(),
    cueCache: new Map(),
    cueReports: new Map(),
    entities: [],
    facts: [],
    segments: new Map(),
    jobs: new Map(),
    queue: [],
    ledger: [],
    fetched: [],
    rendered: [],
    pdfCalls: [],
    ttsCalls: [],
    llmCalls: [],
    written: [],
    removedAudio: [],
  };
  if (options.sourceText) state.sourceText.set(CHAPTER_ID, options.sourceText);

  const orderedChapters = (): Chapter[] =>
    [...state.chapters.values()].sort((a, b) => a.order - b.order);

  const recordFor = (memory: ChapterMemory): ChapterMemoryRecord => {
    const found = orderedChapters().find((c) => c.id === memory.chapterId);
    const order = found?.order ?? 0;
    return {
      chapterOrder: order,
      chapterNumber: orderedChapters().findIndex((c) => c.id === memory.chapterId) + 1,
      memory,
    };
  };

  const chapters: ChapterStore = {
    async load(chapterId) {
      const found = state.chapters.get(chapterId);
      if (!found) return null;
      return {
        chapter: { ...found },
        series: state.series,
        settings: state.settings,
        narration: state.narration,
      } satisfies ChapterRecord;
    },
    async setStatus(chapterId, status: ChapterStatus) {
      const found = state.chapters.get(chapterId);
      if (found) state.chapters.set(chapterId, { ...found, status });
    },
    async setMeta(chapterId, patch) {
      const found = state.chapters.get(chapterId);
      if (!found) return;
      state.chapters.set(chapterId, {
        ...found,
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.sourceLang === undefined ? {} : { sourceLang: patch.sourceLang }),
        ...(patch.wordCount === undefined ? {} : { wordCount: patch.wordCount }),
        ...(patch.durationMs === undefined ? {} : { durationMs: patch.durationMs }),
      });
    },
    async getSourceText(chapterId) {
      return state.sourceText.get(chapterId) ?? null;
    },
    async saveSourceText(chapterId, text) {
      state.sourceText.set(chapterId, text);
    },
    async replaceText(chapterId, text) {
      state.sentences.set(chapterId, storedFrom(text));
    },
    async getSentences(chapterId) {
      return state.sentences.get(chapterId) ?? [];
    },
    async setTranslations(chapterId, translations, partialIdx) {
      const partial = new Set(partialIdx);
      state.sentences.set(
        chapterId,
        (state.sentences.get(chapterId) ?? []).map((s) => ({
          ...s,
          translated: partial.has(s.idx) ? null : (translations.get(s.idx) ?? null),
        })),
      );
    },
    async saveCues(chapterId, cues) {
      state.cues.set(chapterId, cues);
    },
    async getCueCache(key) {
      const cached = state.cueCache.get(key);
      return cached ? [...cached] : null;
    },
    async saveCueCache(key, cues) {
      state.cueCache.set(key, [...cues]);
    },
    async saveCueReport(chapterId, report) {
      state.cueReports.set(chapterId, report);
    },
    async saveMemory(memory) {
      state.memories.set(memory.chapterId, memory);
    },
    async getMemoryRecord(chapterId) {
      const memory = state.memories.get(chapterId);
      return memory ? recordFor(memory) : null;
    },
    async getPriorMemories(seriesId, beforeOrder) {
      void seriesId;
      return [...state.memories.values()]
        .map(recordFor)
        .filter((r) => r.chapterOrder < beforeOrder);
    },
    async getEntities() {
      return { entities: [...state.entities], facts: [...state.facts] };
    },
    async applyEntityResolution(_seriesId, resolution) {
      for (const upsert of resolution.upserts) {
        const index = state.entities.findIndex((e) => e.id === upsert.id);
        if (index >= 0) state.entities[index] = upsert;
        else state.entities.push(upsert);
      }
      state.facts.push(...resolution.newFacts);
    },
    async listAudioSegments(chapterId) {
      return [...(state.segments.get(chapterId) ?? [])].sort((a, b) => a.idx - b.idx);
    },
    async saveAudioSegment(segment) {
      const list = (state.segments.get(segment.chapterId) ?? []).filter(
        (s) => s.idx !== segment.idx,
      );
      state.segments.set(segment.chapterId, [...list, segment]);
    },
    async deleteAudioFrom(chapterId, segmentIdx) {
      state.segments.set(
        chapterId,
        (state.segments.get(chapterId) ?? []).filter((s) => s.idx < segmentIdx),
      );
    },
  };

  const jobKey = (chapterId: string, stage: Stage): string => `${chapterId}|${stage}`;
  const jobs: PipelinePorts['jobs'] = {
    async get(chapterId, stage) {
      return state.jobs.get(jobKey(chapterId, stage)) ?? null;
    },
    async upsert(job) {
      state.jobs.set(jobKey(job.chapterId, job.stage), job);
    },
    async cancelUnfinished(chapterId) {
      for (const [key, job] of state.jobs) {
        if (job.chapterId === chapterId && (job.status === 'pending' || job.status === 'running')) {
          state.jobs.set(key, { ...job, status: 'cancelled' });
        }
      }
    },
    async loadQueue() {
      return [...state.queue];
    },
    async saveQueue(items) {
      state.queue = items.map((item) => ({ ...item }));
    },
  };

  const llm: PipelinePorts['llm'] = {
    transportFor(modelId) {
      const transport: LlmTransport = async (request) => {
        state.llmCalls.push({ model: modelId, request });
        const custom = await options.llm?.(request, modelId);
        return custom ?? defaultReply(request);
      };
      return transport;
    },
  };

  const ports: PipelinePorts = {
    chapters,
    jobs,
    ledger: {
      async record(entry) {
        state.ledger.push(entry);
      },
    },
    fetcher: {
      async fetch(url) {
        state.fetched.push(url);
        return {
          bytes: new TextEncoder().encode(options.html ?? ''),
          contentType: 'text/html; charset=utf-8',
          finalUrl: url,
        };
      },
    },
    webview: {
      async render(url) {
        state.rendered.push(url);
        return options.rendered ?? '';
      },
    },
    pdf: {
      async extract({ engine }) {
        state.pdfCalls.push({ engine });
        const result = options.pdf;
        if (typeof result === 'function') return result(engine);
        if (result) return result;
        return { text: '', pages: [], model: 'pdf/parser', usage: FAKE_USAGE };
      },
    },
    tts: {
      async synthesize({ text, profile }) {
        state.ttsCalls.push({ text, style: profile.style, voice: profile.voice });
        if (options.tts) return options.tts(text, profile);
        const frames = Math.max(1, Math.ceil(text.length / 200));
        return { bytes: mp3Bytes(frames), mime: 'audio/mpeg', costUsd: null };
      },
    },
    audio: {
      async write(chapterId, segmentIdx, bytes, ext) {
        const uri = `file:///fake/${chapterId}/${segmentIdx}.${ext}`;
        state.written.push(`${uri}:${bytes.length}`);
        return uri;
      },
      async remove(chapterId) {
        state.removedAudio.push(chapterId);
      },
    },
    llm,
    catalog: {
      async find(modelId) {
        return catalog[modelId] ?? null;
      },
    },
    clock: {
      now() {
        tick += 1;
        return T0 + tick;
      },
    },
    ids: () => ulid((nextId += 1)),
  };

  return {
    ports,
    state,
    addChapter: (id, order, text) => {
      state.chapters.set(id, {
        ...chapter,
        id,
        order,
        title: '',
        source: { kind: 'text', label: `Chapter ${order}` },
        status: 'draft',
      });
      state.sourceText.set(id, text);
    },
    chapter: (id = CHAPTER_ID) => {
      const found = state.chapters.get(id);
      if (!found) throw new Error(`no chapter ${id}`);
      return found;
    },
    job: (stage, id = CHAPTER_ID) => state.jobs.get(jobKey(id, stage)),
  };
}
