# Domain contracts (v1)

These are the authoritative types. Implementations live in `src/core/domain/*.ts` as zod schemas with `z.infer` types. Changing a contract requires an ADR.

## IDs and ordering
- IDs are ULIDs as strings (they sort by time). Use the `ulid` package or an equivalent pure-JS one.
- `Chapter.order` is a REAL so chapters can be reordered by inserting midway. The display number is derived from rank.
- `SentenceRef = { chapterId: string; idx: number }`, where `idx` is 0-based and unique within a chapter.

## Library
```ts
Series   { id, title, coverUri: string|null, coverTint: string|null /* hex */, sourceLang: Lang|null,
           targetLang: Lang|null, narrationProfileId: string|null, createdAt, updatedAt }
Chapter  { id, seriesId, order: number, title, source: ChapterSource, sourceLang: Lang|null,
           status: ChapterStatus, wordCount: number|null, durationMs: number|null,
           createdAt, updatedAt }
ChapterSource = { kind: 'url', url: string, finalUrl?: string }
              | { kind: 'pdf', fileUri: string, fileName: string, pageRange?: [number, number] }
              | { kind: 'text', label: string }               // pasted text
ChapterStatus = 'draft' | 'processing' | 'ready' | 'failed'
Lang = BCP-47 string, e.g. 'zh-Hans', 'it', 'pt-BR'
```

## Text
```ts
Paragraph { idx, sentenceStart, sentenceEnd /* exclusive */, kind: 'text'|'heading'|'quote'|'dialogue' }
Sentence  { chapterId, idx, paragraphIdx, text /* original */, translated: string|null,
            charCount: number }
```

## Pipeline
```ts
Stage = 'extract' | 'clean' | 'segment' | 'analyze' | 'translate' | 'narrate'
Job   { id, chapterId, stage, status: 'pending'|'running'|'done'|'failed'|'skipped'|'cancelled',
        attempt: number, inputHash: string, model: string|null, promptVersion: string|null,
        progress: number /* 0..1 */, error: PipelineError|null, costUsd: number, startedAt, finishedAt }
PipelineError { code: ErrorCode, message: string /* user-facing */, detail?: string, retryable: boolean }
ErrorCode = 'NETWORK' | 'AUTH' | 'INSUFFICIENT_CREDITS' | 'RATE_LIMITED' | 'MODEL_UNAVAILABLE'
          | 'CONTENT_EMPTY' | 'CONTENT_BLOCKED' | 'PARSE_FAILED' | 'LLM_INVALID_OUTPUT'
          | 'INPUT_TOO_LONG' | 'STORAGE_FULL' | 'CANCELLED' | 'UNKNOWN'
```

## Analysis: ambience
```ts
AmbienceCategoryId = enum from the taxonomy (docs/research/R4-ambience.md → src/core/analysis/ambience-taxonomy.ts)
AmbienceCue { id, chapterId, category: AmbienceCategoryId, startSentence, endSentence /* inclusive */,
              intensity: 'low'|'medium'|'high', fadeInMs, fadeOutMs, confidence: number /*0..1*/,
              reason: string /* ≤ 80 chars, shown in a debug/info sheet */, enabled: boolean }
```

## Analysis: memory
```ts
ChapterMemory {
  chapterId, promptVersion, model,
  summary: string                // ≤ 120 words
  keyEvents: string[]            // ≤ 10, each ≤ 25 words, chronological
  characters: { name, aliases: string[], role?: string, facts: string[] /* ≤ 5 each */ }[]  // ≤ 15
  places: { name, facts: string[] }[]        // ≤ 8
  items: { name, facts: string[] }[]         // ≤ 8 (artifacts, techniques, organisations)
  relationships: { a, b, nature: string }[]  // ≤ 10
  openThreads: string[]          // ≤ 5 unresolved questions raised so far
  glossary: { term, translation?: string, note?: string }[]  // names/terms for translation consistency, ≤ 30
}
Entity      { id, seriesId, kind: 'character'|'place'|'item'|'faction'|'term', canonicalName, aliases: string[],
              firstChapterOrder: number }
EntityFact  { id, entityId, chapterId, chapterOrder: number, fact: string }
```
Entity resolution merges by normalized name or alias match (case/diacritic/width-insensitive). The LLM may also return `sameAs` hints.

## Narration
```ts
NarrationProfile { id, name, provider: TtsProviderId, model: string, voice: string,
                   style: string|null /* steering instructions, if supported */, speed: number /* 0.8..1.2 synth-time */ }
AudioSegment { id, chapterId, idx, sentenceStart, sentenceEnd /* inclusive */, fileUri, durationMs,
               sentenceOffsetsMs: number[] /* start offset of each sentence in the segment */, profileId, inputHash }
```

## Spoiler cutoff
```ts
PlaybackPoint     { chapterId, chapterOrder, sentenceIdx }
ListeningPosition { seriesId, current: PlaybackPoint, furthest: PlaybackPoint, updatedAt }   // amended 2026-10-11 (B3)
// cutoff = `furthest`. No position row ⇒ nothing from the book is visible to Q&A. Q&A may see:
//   memories + facts where chapterOrder < cutoff.chapterOrder
//   sentences of the cutoff chapter with idx <= cutoff.sentenceIdx (via FTS)
//   nothing else.
```

## Usage
```ts
UsageEntry { id, at, chapterId|null, stage|'qa'|'vocab'|'validate', model, promptTokens, completionTokens,
             audioSeconds|null, costUsd, generationId: string|null }
```

## Additions accepted 2026-10-11 (B3)
`Vocab`, `QaMessage {id, seriesId, role: 'user'|'assistant', content, cutoffChapterOrder, cutoffSentenceIdx, citations, createdAt}`, `TtsProviderId = 'openrouter' | 'device'`. Timestamps are epoch ms. LLM output schemas use `.nullable()`, never `.optional()` (strict json_schema compatibility).
