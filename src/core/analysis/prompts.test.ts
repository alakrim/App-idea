import { enabledCategories } from './ambience-taxonomy';
import { COVERAGE_GOAL_PERCENT, CUE_LIMITS } from './limits';
import {
  ANALYSIS_SYSTEM_PROMPT,
  PROMPT_VERSION,
  SETTING_FALLBACK_SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildSettingFallbackPrompt,
  buildSummaryReducePrompt,
} from './prompts';

describe('analysis prompts', () => {
  it('carries a version string', () => {
    expect(PROMPT_VERSION).toBe('analysis-v3');
  });

  it('states the setting-coverage policy with the taxonomy ids it names', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toContain('Setting first.');
    for (const id of ['tavern_crowd', 'forest_night', 'ship_deck']) {
      expect(ANALYSIS_SYSTEM_PROMPT).toContain(id);
    }
    expect(ANALYSIS_SYSTEM_PROMPT).toContain(
      `roughly ${COVERAGE_GOAL_PERCENT.min} to ${COVERAGE_GOAL_PERCENT.max} percent`,
    );
  });

  it('derives the numeric cue rules from CUE_LIMITS, so the prompt and the validators agree', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toContain(`Omit cues below ${CUE_LIMITS.confidenceFloor}.`);
    expect(ANALYSIS_SYSTEM_PROMPT).toContain(
      `At most ${CUE_LIMITS.maxPer1kWords} cues per 1,000 words`,
    );
    expect(ANALYSIS_SYSTEM_PROMPT).toContain(
      `at least ${CUE_LIMITS.minSentences} sentences and roughly ${CUE_LIMITS.minSeconds} seconds`,
    );
  });

  it('adds the cues-decided note only when the cues of the text are cached', () => {
    const base = {
      sentences: [{ idx: 0, text: 'Rain fell.' }],
      seriesTitle: 'S',
      chapterTitle: 'C',
      priorContext: '',
      lang: 'en' as const,
    };
    expect(buildAnalysisPrompt(base).user).not.toContain('already decided');
    expect(buildAnalysisPrompt({ ...base, cuesDecided: false }).user).not.toContain(
      'already decided',
    );
    const decided = buildAnalysisPrompt({ ...base, cuesDecided: true });
    expect(decided.user).toContain('Return "cues": [] and choose none.');
    expect(decided.system).toBe(ANALYSIS_SYSTEM_PROMPT);
  });

  it('builds the fallback prompt from the chapter summary, events and places only', () => {
    const { system, user } = buildSettingFallbackPrompt({
      chapterTitle: 'Chapter 3',
      memory: {
        summary: 'The crew sails through the storm.',
        keyEvents: ['The mast breaks.'],
        characters: [],
        places: [{ name: 'the Gull', facts: [] }],
        items: [],
        relationships: [],
        openThreads: [],
        glossary: [],
      },
    });
    expect(system).toBe(SETTING_FALLBACK_SYSTEM_PROMPT);
    expect(system).toContain('{"cue": null}');
    expect(user).toContain('Chapter: Chapter 3');
    expect(user).toContain('Summary: The crew sails through the storm.');
    expect(user).toContain('- The mast breaks.');
    expect(user).toContain('- the Gull');
  });

  it('marks empty fallback sections as none', () => {
    const { user } = buildSettingFallbackPrompt({
      chapterTitle: 'C',
      memory: {
        summary: '',
        keyEvents: [],
        characters: [],
        places: [],
        items: [],
        relationships: [],
        openThreads: [],
        glossary: [],
      },
    });
    expect(user).toContain('Key events:\n(none)');
    expect(user).toContain('Places:\n(none)');
  });

  it('keeps the system prompt identical across chapters, series and languages (cacheable prefix)', () => {
    const a = buildAnalysisPrompt({
      sentences: [{ idx: 0, text: 'Rain fell.' }],
      seriesTitle: 'Series A',
      chapterTitle: 'Chapter 1',
      priorContext: '',
      lang: 'en',
    });
    const b = buildAnalysisPrompt({
      sentences: [{ idx: 40, text: 'A bell rang.' }],
      seriesTitle: 'Series B',
      chapterTitle: 'Chapter 9',
      priorContext: '## Characters\n- Ana',
      lang: 'it',
    });
    expect(a.system).toBe(b.system);
    expect(a.system).toBe(ANALYSIS_SYSTEM_PROMPT);
    expect(a.system).not.toContain('Chapter 9');
    expect(a.system).not.toContain('Series B');
  });

  it('lists every enabled category id and no oneshot id in the system prompt', () => {
    for (const c of enabledCategories())
      expect(ANALYSIS_SYSTEM_PROMPT).toContain(`${c.id}: ${c.description}`);
    expect(ANALYSIS_SYSTEM_PROMPT).not.toContain('gunshot:');
    expect(ANALYSIS_SYSTEM_PROMPT).not.toContain('thunder_clap:');
  });

  it('presents sentences as [idx] text lines in the user message', () => {
    const { user } = buildAnalysisPrompt({
      sentences: [
        { idx: 3, text: 'First  line\nbroken.' },
        { idx: 4, text: 'Second.' },
      ],
      seriesTitle: 'S',
      chapterTitle: 'C',
      priorContext: '',
      lang: 'pt-BR',
    });
    expect(user).toContain('[3] First line broken.');
    expect(user).toContain('[4] Second.');
    expect(user).toContain('Target language: pt-BR');
    expect(user).toContain('(none)');
  });

  it('builds the summary reduce prompt from part summaries', () => {
    const { system, user } = buildSummaryReducePrompt({
      chapterTitle: 'Chapter 2',
      lang: 'en',
      summaries: ['They leave the city.', 'They reach the coast.'],
    });
    expect(system).toContain('at most 120 words');
    expect(user).toContain('Part 1: They leave the city.');
    expect(user).toContain('Part 2: They reach the coast.');
  });

  it('matches the snapshot of the static system prompt', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatchSnapshot();
  });
});
