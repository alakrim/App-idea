import { fireEvent, screen } from '@testing-library/react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';
import { PipelineFailure } from '@/services/openrouter/errors';

import { askErrorCopy } from './ask-errors';
import { AskView, type AskViewProps } from './ask-view';

// Reanimated's worklets runtime and lucide's ESM are not loadable under Jest. See library-tab.test.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('@/__tests__/helpers/reanimated-stub'));

jest.mock('@gorhom/bottom-sheet', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@/__tests__/helpers/feature-mocks').bottomSheetStub(),
);
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));

const SERIES = { id: 'series-1', title: 'The Jade Lantern' };
const CHAPTERS = [
  { chapterId: 'c1', number: 1, title: 'Arrival' },
  { chapterId: 'c2', number: 2, title: 'The Scroll' },
];

function baseProps(overrides: Partial<AskViewProps> = {}): AskViewProps {
  return {
    options: [SERIES],
    selectedId: SERIES.id,
    data: {
      seriesId: SERIES.id,
      title: SERIES.title,
      chapters: CHAPTERS,
      cutoff: { chapterId: 'c2', chapterNumber: 2, chapterCount: 4, reachedShare: 0.5 },
      suggestions: ['Who is Lin Mo?', 'What happened in chapter 1?'],
      thread: [],
    },
    draft: '',
    sending: null,
    failure: null,
    onDraftChange: jest.fn(),
    onSelectSeries: jest.fn(),
    onSend: jest.fn(),
    onAsk: jest.fn(),
    onOpenChapter: jest.fn(),
    onOpenLibrary: jest.fn(),
    onOpenSettings: jest.fn(),
    onRetry: jest.fn(),
    ...overrides,
  };
}

describe('AskView render states', () => {
  it('shows the empty state with a library call to action when no series is analyzed', async () => {
    const props = baseProps({ options: [], selectedId: null, data: null });
    await renderThemed(<AskView {...props} />);

    expect(
      screen.getByRole('header', { name: "Ask about anything you've already heard" }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Browse your library' }));
    expect(props.onOpenLibrary).toHaveBeenCalled();
  });

  it('shows a skeleton while the series loads', async () => {
    await renderThemed(<AskView {...baseProps({ data: null })} />);

    expect(screen.getByLabelText('Loading the conversation')).toBeOnTheScreen();
  });

  it('explains that listening must start when there is no position yet', async () => {
    const props = baseProps({
      data: { ...baseProps().data!, cutoff: null, suggestions: [] },
    });
    await renderThemed(<AskView {...props} />);

    expect(screen.getByRole('header', { name: 'Nothing heard yet' })).toBeOnTheScreen();
    expect(screen.getByText(/Start listening to this series first/)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Your question')).toBeNull();
  });

  it('shows the spoiler shield with the cutoff chapter and percentage', async () => {
    await renderThemed(<AskView {...baseProps()} />);

    expect(
      screen.getByRole('button', {
        name: 'Spoiler shield: answers reach chapter 2 of 4, 50 percent. Tap to learn more.',
      }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Up to Ch. 2 · 50%')).toBeOnTheScreen();
  });

  it('offers suggested questions on an empty thread and asks the one pressed', async () => {
    const props = baseProps();
    await renderThemed(<AskView {...props} />);

    expect(screen.getByText('Try asking')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Ask: Who is Lin Mo?' }));
    expect(props.onAsk).toHaveBeenCalledWith('Who is Lin Mo?');
  });

  it('renders an answer with citation chips that open the cited chapter', async () => {
    const props = baseProps({
      data: {
        ...baseProps().data!,
        suggestions: [],
        thread: [
          {
            id: 'm1',
            seriesId: SERIES.id,
            role: 'user',
            content: 'Who is the master?',
            cutoffChapterOrder: 2,
            cutoffSentenceIdx: 3,
            citations: [],
            createdAt: 1,
          },
          {
            id: 'm2',
            seriesId: SERIES.id,
            role: 'assistant',
            content: 'Master Wen trained him (Ch. 1). He hid the scroll (Ch. 2).',
            cutoffChapterOrder: 2,
            cutoffSentenceIdx: 3,
            citations: [],
            createdAt: 2,
          },
        ],
      },
    });
    await renderThemed(<AskView {...props} />);

    expect(screen.getByText('Who is the master?')).toBeOnTheScreen();
    expect(screen.getByText('Master Wen trained him. He hid the scroll.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('link', { name: 'Open chapter 2, The Scroll' }));
    expect(props.onOpenChapter).toHaveBeenCalledWith('c2');
  });

  it('shows the pending state and disables sending while an answer is on its way', async () => {
    await renderThemed(
      <AskView {...baseProps({ draft: 'Who is Wen?', sending: 'Who is Wen?' })} />,
    );

    expect(screen.getByText('Reading your notes')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Send question', disabled: true })).toBeOnTheScreen();
  });

  it('enables sending once there is a question and nothing is in flight', async () => {
    const props = baseProps({ draft: 'Who is Wen?' });
    await renderThemed(<AskView {...props} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Send question' }));
    expect(props.onSend).toHaveBeenCalled();
  });

  it('shows a missing-key failure with an action that opens Settings', async () => {
    const failure = {
      ...askErrorCopy(
        new PipelineFailure({ code: 'AUTH', message: 'Add your OpenRouter key', retryable: false }),
      ),
      question: 'Who is Wen?',
    };
    const props = baseProps({ failure });
    await renderThemed(<AskView {...props} />);

    expect(screen.getByRole('header', { name: 'Add your key first' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Open Settings' }));
    expect(props.onOpenSettings).toHaveBeenCalled();
  });

  it('retries a network failure in place', async () => {
    const failure = {
      ...askErrorCopy(
        new PipelineFailure({ code: 'NETWORK', message: 'offline', retryable: true }),
      ),
      question: 'Who is Wen?',
    };
    const props = baseProps({ failure });
    await renderThemed(<AskView {...props} />);

    expect(screen.getByRole('header', { name: "You're offline" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(props.onRetry).toHaveBeenCalled();
  });
});
