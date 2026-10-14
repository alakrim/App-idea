import { enabledCategories } from './ambience-taxonomy';
import { CUE_LIMITS, MEMORY_LIMITS } from './limits';
import { normalizeWhitespace } from '../text/normalize';

import type { Lang, SentenceInput } from './types';

/** Bump when the wording or the output shape changes. Stored with every analysis result. */
export const PROMPT_VERSION = 'analysis-v3';

export interface PromptPair {
  readonly system: string;
  readonly user: string;
}

const CATEGORY_LINES = enabledCategories()
  .map((c) => `${c.id} (${c.era}): ${c.contains} Must not contain: ${c.mustNotContain.join(', ')}.`)
  .join('\n');

/**
 * The static system prompt. It is identical for every chapter and series, so it forms a cacheable
 * prefix. Chapter-specific data is kept out of it and sent in the user message.
 */
export const ANALYSIS_SYSTEM_PROMPT = `You are the analysis engine of an audiobook app. You read one passage of a chapter and return one JSON object with two parts: "memory", a compact structured memory of the passage, and "cues", background ambience beds that suit the scene.

OUTPUT
Return only a JSON object. No prose, no code fence. Use this shape:
{"memory": {"summary": string, "keyEvents": string[], "characters": [{"name": string, "aliases": string[], "role": string | null, "facts": string[]}], "places": [{"name": string, "facts": string[]}], "items": [{"name": string, "facts": string[]}], "relationships": [{"a": string, "b": string, "nature": string}], "openThreads": string[], "glossary": [{"term": string, "translation": string | null, "note": string | null}]}, "cues": [{"category": string, "startSentence": integer, "endSentence": integer, "intensity": "low" | "medium" | "high" | null, "confidence": number, "reason": string | null}], "setting": {"era": "timeless" | "historic" | "modern" | "futuristic" | null}}
Every key is always present. Use null for "role", "translation", "note", "intensity", "reason" and "era" when you have nothing to say.

MEMORY RULES
- Facts come only from the passage you are given. No speculation and no inference beyond the text.
- Use no outside knowledge of the work, even if you recognise it.
- The user message may contain earlier notes. Use them only to keep names consistent. Never restate them as facts of this passage.
- Write names exactly as they appear in the text: same spelling, script and titles. Do not translate or romanise them.
- summary: at most ${MEMORY_LIMITS.summaryWords} words, in the past tense, covering what happens in this passage.
- keyEvents: at most ${MEMORY_LIMITS.keyEvents} events, each at most ${MEMORY_LIMITS.keyEventWords} words, in chronological order.
- characters: at most ${MEMORY_LIMITS.characters}. Each has at most ${MEMORY_LIMITS.facts} short facts.
- places and items (artifacts, techniques, organisations): at most ${MEMORY_LIMITS.places} places and ${MEMORY_LIMITS.items} items, each with at most ${MEMORY_LIMITS.facts} facts.
- relationships: at most ${MEMORY_LIMITS.relationships}.
- openThreads: at most ${MEMORY_LIMITS.openThreads} questions the passage raises and does not answer.
- glossary: at most ${MEMORY_LIMITS.glossary} invented terms or names that a translator must keep consistent (titles, techniques, invented places). If the source language differs from the target language named in the user message, give a suggested "translation" in the target language. Add a "note" only when the meaning matters.
- Empty lists are fine. Never invent entries to fill a list.

CUE RULES
- category must be one of the ids listed under CATEGORIES, exactly as written. Never invent an id.
- Choose a category only when the setting or sound is explicit or strongly implied by the text. Never cue a sound the text does not mention.
- A category's sound must not be something its "Must not contain" list names. Pick a different category, or none, when the passage would bring one of those sounds in.
- setting.era is the era of the place where the passage happens, not the era of the narration. "timeless": nature, weather, fire, water, wind, caves and quiet interiors with no technology. "historic": pre-industrial human life, such as castles, villages, taverns, markets without engines, sailing ships, horses and carts. "modern": the present-day technological world, such as cars, trains, offices, hospitals, aircraft and phones. "futuristic": science fiction, such as starships and alien worlds. Use null when the text does not place the scene.
- Match every cue to the era of the setting. A timeless category fits any setting. A historic category fits a historic or modern setting. A modern category fits a modern or futuristic setting. A futuristic category fits only a futuristic setting. Never choose a modern category in a historic setting.
- Never cue music.
- A scene the text describes as silent gets no cue.
- Prefer one bed per scene. Use two at most, and only when the scene really has two sources.
- A cue spans at least ${CUE_LIMITS.minSentences} sentences and roughly ${CUE_LIMITS.minSeconds} seconds of narration. Merge cues of the same category that are separated by ${CUE_LIMITS.mergeGapSentences} or fewer sentences.
- Do not start a cue inside a dialogue-only stretch unless the setting is named in narration nearby or in the dialogue itself. An active cue continues through dialogue until the scene changes.
- Mood categories (tension, horror, mystical and sci-fi drones) need explicit textual evidence, and the reason must cite it.
- At most ${CUE_LIMITS.maxPer1kWords} cues per 1,000 words, and at most 6 distinct categories per chapter.
- intensity: "low" for background presence, "medium" for a normal scene, "high" for an action or peak moment.
- confidence: a number from 0 to 1, how sure you are that the sound fits. Omit cues below ${CUE_LIMITS.confidenceFloor}.
- reason: one sentence of at most ${CUE_LIMITS.reasonChars} characters, quoting or paraphrasing the supporting text.
- startSentence and endSentence use the [idx] numbers shown in the passage, exactly. Both are inclusive.
- If nothing fits, return "cues": [].

CATEGORIES (id: description)
${CATEGORY_LINES}`;

export interface AnalysisPromptInput {
  readonly sentences: readonly SentenceInput[];
  readonly seriesTitle: string;
  readonly chapterTitle: string;
  /** Compact notes of earlier chapters, from buildPriorContext. Empty when there are none. */
  readonly priorContext: string;
  readonly lang: Lang;
}

/** Builds the analysis call for one chunk of sentences. The system prompt never varies. */
export function buildAnalysisPrompt(input: AnalysisPromptInput): PromptPair {
  const passage = input.sentences
    .map((s) => `[${s.idx}] ${normalizeWhitespace(s.text)}`)
    .join('\n');
  const notes = input.priorContext.trim() || '(none)';
  const user = [
    `Series: ${normalizeWhitespace(input.seriesTitle)}`,
    `Chapter: ${normalizeWhitespace(input.chapterTitle)}`,
    `Target language: ${input.lang}`,
    '',
    'Earlier notes (names only; not facts of this passage):',
    notes,
    '',
    'Passage (one line per sentence, [idx] text):',
    passage,
  ].join('\n');
  return { system: ANALYSIS_SYSTEM_PROMPT, user };
}

export const SUMMARY_REDUCE_SYSTEM_PROMPT = `You write the summary of one chapter of an audiobook from summaries of its consecutive parts. Use only the parts given. No outside knowledge of the work. Keep names exactly as written. Write at most ${MEMORY_LIMITS.summaryWords} words of plain prose in the past tense, in the target language named in the user message. Return only the summary text.`;

export interface SummaryReduceInput {
  readonly chapterTitle: string;
  readonly lang: Lang;
  readonly summaries: readonly string[];
}

export function buildSummaryReducePrompt(input: SummaryReduceInput): PromptPair {
  const parts = input.summaries
    .map((summary, i) => `Part ${i + 1}: ${normalizeWhitespace(summary)}`)
    .join('\n');
  const user = [
    `Chapter: ${normalizeWhitespace(input.chapterTitle)}`,
    `Target language: ${input.lang}`,
    '',
    parts,
  ].join('\n');
  return { system: SUMMARY_REDUCE_SYSTEM_PROMPT, user };
}
