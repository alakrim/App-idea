/*
 * Ports: every I/O the pipeline needs, as precise interfaces. The core never touches the database,
 * the network, the file system or a WebView directly. The app layer (P2) implements these with
 * SQLite, OpenRouter, expo-file-system and a hidden WebView, and tests use in-memory fakes.
 */
import type { ChapterMemoryRecord, ValidatedCue } from '../analysis/types';
import type {
  AudioSegment,
  Chapter,
  ChapterMemory,
  ChapterStatus,
  Entity,
  EntityFact,
  Id,
  IdGenerator,
  Job,
  Lang,
  NarrationProfile,
  ParagraphKind,
  Series,
  Stage,
  UsageEntry,
} from '../domain';
import type { ModelPricing } from '../llm/cost';
import type { LlmTransport, LlmUsage } from '../llm/transport';
import type { EntityResolution } from '../memory/entities';
import type { Settings } from '../settings';
import type { ChapterText } from '../text/build';

/** A chapter with everything a run needs, read once when the run starts. */
export interface ChapterRecord {
  readonly chapter: Chapter;
  readonly series: Series;
  /** The user's settings snapshot: the models used by the stages. */
  readonly settings: Settings;
  /** The narration profile in force. Its `id` identifies the audio it produces. */
  readonly narration: NarrationProfile;
}

/** Fields the stages may set on a chapter. Absent keys are left unchanged. */
export interface ChapterMetaPatch {
  readonly title?: string;
  readonly sourceLang?: Lang | null;
  readonly wordCount?: number | null;
  readonly durationMs?: number | null;
}

/** A stored sentence. `translated` is null when there is no usable translation for it. */
export interface StoredSentence {
  readonly idx: number;
  readonly paragraphIdx: number;
  readonly kind: ParagraphKind;
  readonly text: string;
  readonly translated: string | null;
  readonly charCount: number;
}

export interface EntitySnapshot {
  readonly entities: Entity[];
  readonly facts: EntityFact[];
}

export interface ChapterStore {
  /** The chapter, its series and the settings snapshot. Null when the chapter does not exist. */
  load(chapterId: Id): Promise<ChapterRecord | null>;
  setStatus(chapterId: Id, status: ChapterStatus): Promise<void>;
  setMeta(chapterId: Id, patch: ChapterMetaPatch): Promise<void>;
  /** The chapter's plain text as extracted (or pasted), before segmentation. Null when absent. */
  getSourceText(chapterId: Id): Promise<string | null>;
  saveSourceText(chapterId: Id, text: string): Promise<void>;
  /** Replaces the paragraphs and sentences of a chapter, and clears their translations. */
  replaceText(chapterId: Id, text: ChapterText): Promise<void>;
  getSentences(chapterId: Id): Promise<StoredSentence[]>;
  /**
   * Stores the translations of every sentence. `partialIdx` lists the sentences that fell back to
   * the source text. Those are stored with `translated: null`, so the UI can show them.
   */
  setTranslations(
    chapterId: Id,
    translations: ReadonlyMap<number, string>,
    partialIdx: readonly number[],
  ): Promise<void>;
  /** Replaces the chapter's ambience cues. The store assigns ids and `enabled: true`. */
  saveCues(chapterId: Id, cues: readonly ValidatedCue[]): Promise<void>;
  /** Stores (replaces) the chapter's memory card. */
  saveMemory(memory: ChapterMemory): Promise<void>;
  /** The memory of one chapter with its order and display number. Null when none is stored. */
  getMemoryRecord(chapterId: Id): Promise<ChapterMemoryRecord | null>;
  /** Memories of the series' chapters strictly before `beforeOrder`. */
  getPriorMemories(seriesId: Id, beforeOrder: number): Promise<ChapterMemoryRecord[]>;
  getEntities(seriesId: Id): Promise<EntitySnapshot>;
  applyEntityResolution(seriesId: Id, resolution: EntityResolution): Promise<void>;
  /** Stored segments of a chapter, in segment order. */
  listAudioSegments(chapterId: Id): Promise<AudioSegment[]>;
  saveAudioSegment(segment: AudioSegment): Promise<void>;
  /** Deletes the segments with `idx >= segmentIdx`, rows only. Files are overwritten on write. */
  deleteAudioFrom(chapterId: Id, segmentIdx: number): Promise<void>;
}

/** A queued chapter and the options its run was queued with. Persisted, so they survive a restart. */
export interface PersistedQueueItem {
  readonly chapterId: string;
  readonly from?: Stage;
  readonly force?: boolean;
  readonly pdfEngine?: PdfEngine;
}

export interface JobStore {
  get(chapterId: Id, stage: Stage): Promise<Job | null>;
  upsert(job: Job): Promise<void>;
  /** Marks every pending or running job of the chapter as cancelled. */
  cancelUnfinished(chapterId: Id): Promise<void>;
  /** The persisted chapter queue, in order. Used to resume the queue after an app restart. */
  loadQueue(): Promise<PersistedQueueItem[]>;
  saveQueue(items: readonly PersistedQueueItem[]): Promise<void>;
}

export interface UsageLedger {
  record(entry: UsageEntry): Promise<void>;
}

export interface FetchLimits {
  /** Responses larger than this are refused. */
  readonly maxBytes: number;
  readonly timeoutMs: number;
}

export interface FetchResult {
  readonly bytes: Uint8Array;
  readonly contentType: string | null;
  /** The URL after redirects. */
  readonly finalUrl: string;
}

export interface Fetcher {
  fetch(url: string, signal: AbortSignal, limits: FetchLimits): Promise<FetchResult>;
}

export interface WebViewExtractor {
  /** Renders the page in a sandboxed hidden WebView and returns its HTML. */
  render(url: string, signal: AbortSignal): Promise<string>;
}

export type PdfEngine = 'cloudflare-ai' | 'mistral-ocr';

export interface PdfTextResult {
  /** The whole document text. */
  readonly text: string;
  /** Text of each page in order. Its length is the page count. */
  readonly pages: readonly string[];
  /** The model that was billed for the parse. */
  readonly model: string;
  readonly usage: LlmUsage;
}

export interface PdfTextSource {
  extract(input: {
    fileUri: string;
    engine: PdfEngine;
    signal: AbortSignal;
  }): Promise<PdfTextResult>;
}

export interface TtsResult {
  readonly bytes: Uint8Array;
  readonly mime: string;
  /** Provider-reported cost in USD, or null when none was reported. */
  readonly costUsd: number | null;
}

export interface Tts {
  /**
   * Synthesizes one passage. The core clears `profile.style` before the call when the model does
   * not support steering, so the adapter can pass it through unchanged.
   */
  synthesize(input: {
    text: string;
    profile: NarrationProfile;
    signal: AbortSignal;
  }): Promise<TtsResult>;
}

export interface AudioFiles {
  /** Writes one segment and returns its URI. A rewrite of the same segment replaces the file. */
  write(chapterId: Id, segmentIdx: number, bytes: Uint8Array, ext: string): Promise<string>;
  remove(chapterId: Id): Promise<void>;
}

export interface Clock {
  /** Epoch milliseconds. */
  now(): number;
}

export interface CatalogModel {
  readonly id: string;
  readonly pricing: ModelPricing;
  /** True when the model honours the `instructions` (style) field. */
  readonly supportsStyle: boolean;
}

export interface Catalog {
  /** The model from the live catalog, or null when it is unknown (for example, it was removed). */
  find(modelId: string): Promise<CatalogModel | null>;
}

/** Binds an LLM transport to one model id. The core asks for one per stage. */
export interface LlmPort {
  transportFor(modelId: string): LlmTransport;
}

/** Every port the pipeline uses, in one object so that the runner and stages take a single argument. */
export interface PipelinePorts {
  readonly chapters: ChapterStore;
  readonly jobs: JobStore;
  readonly ledger: UsageLedger;
  readonly fetcher: Fetcher;
  readonly webview: WebViewExtractor;
  readonly pdf: PdfTextSource;
  readonly tts: Tts;
  readonly audio: AudioFiles;
  readonly llm: LlmPort;
  readonly catalog: Catalog;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}
