import { ANALYSIS_SYSTEM_PROMPT, PROMPT_VERSION, buildAnalysisPrompt, buildSummaryReducePrompt } from './prompts';
import { enabledCategories } from './ambience-taxonomy';

describe('analysis prompts', () => {
  it('carries a version string', () => {
    expect(PROMPT_VERSION).toBe('analysis-v1');
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
    for (const c of enabledCategories()) expect(ANALYSIS_SYSTEM_PROMPT).toContain(`${c.id}: ${c.description}`);
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
