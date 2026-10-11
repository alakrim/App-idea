import { fireEvent, screen } from '@testing-library/react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';

import { startReview, reveal } from './review';
import { ReviewView, type ReviewViewProps } from './review-view';
import { VocabView, type VocabViewProps } from './vocab-view';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('@/__tests__/helpers/reanimated-stub'));

jest.mock('@gorhom/bottom-sheet', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@/__tests__/helpers/feature-mocks').bottomSheetStub(),
);
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
// The swipe container renders its delete panel inline, so the test can press it without a gesture.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      children,
      renderRightActions,
    }: {
      children: unknown;
      renderRightActions?: () => unknown;
    }) =>
      React.createElement(View, null, children, renderRightActions ? renderRightActions() : null),
  };
});

const ITEM = {
  id: 'v1',
  seriesId: 's1',
  chapterId: 'c1',
  sentenceIdx: 0,
  term: 'bellissimo',
  lang: 'it',
  explanation: 'Very beautiful.',
  translation: 'beautiful',
  createdAt: 1,
  reviewedAt: null,
  known: false,
};

function viewProps(overrides: Partial<VocabViewProps> = {}): VocabViewProps {
  return {
    groups: [
      {
        lang: 'it',
        label: 'Italiano',
        series: [
          {
            seriesId: 's1',
            title: 'The Jade Lantern',
            cards: [{ item: ITEM, sentence: 'Il tramonto era bellissimo.' }],
          },
        ],
      },
    ],
    query: '',
    total: 1,
    onQueryChange: jest.fn(),
    onStartReview: jest.fn(),
    onOpenLibrary: jest.fn(),
    onOpenSource: jest.fn(),
    onDelete: jest.fn(),
    onRetry: jest.fn(),
    explanationOf: () => ({ pending: false, failure: null }),
    ...overrides,
  };
}

describe('VocabView render states', () => {
  it('shows the empty state with a library call to action when nothing is saved', async () => {
    const props = viewProps({ groups: [], total: 0 });
    await renderThemed(<VocabView {...props} />);

    expect(screen.getByRole('header', { name: 'Save words while you listen' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Browse your library' }));
    expect(props.onOpenLibrary).toHaveBeenCalled();
  });

  it('groups items by language, then by series, with term, translation and explanation', async () => {
    await renderThemed(<VocabView {...viewProps()} />);

    expect(screen.getByRole('header', { name: 'Italiano' })).toBeOnTheScreen();
    expect(screen.getByText('The Jade Lantern')).toBeOnTheScreen();
    expect(screen.getByText('bellissimo')).toBeOnTheScreen();
    expect(screen.getByText('beautiful')).toBeOnTheScreen();
    expect(screen.getByText('Very beautiful.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Review (1)' })).toBeOnTheScreen();
  });

  it('opens the source sentence in its chapter', async () => {
    const props = viewProps();
    await renderThemed(<VocabView {...props} />);

    await fireEvent.press(screen.getByRole('link', { name: 'Open the sentence in its chapter' }));
    expect(props.onOpenSource).toHaveBeenCalledWith('c1', 0);
  });

  it('shows a progress message while the explanation is being fetched', async () => {
    await renderThemed(
      <VocabView
        {...viewProps({
          groups: [
            {
              lang: 'it',
              label: 'Italiano',
              series: [
                {
                  seriesId: 's1',
                  title: 'The Jade Lantern',
                  cards: [
                    { item: { ...ITEM, explanation: null, translation: null }, sentence: null },
                  ],
                },
              ],
            },
          ],
          explanationOf: () => ({ pending: true, failure: null }),
        })}
      />,
    );

    expect(screen.getByText('Getting the explanation…')).toBeOnTheScreen();
  });

  it('shows why an explanation failed and retries it on request', async () => {
    const props = viewProps({
      groups: [
        {
          lang: 'it',
          label: 'Italiano',
          series: [
            {
              seriesId: 's1',
              title: 'The Jade Lantern',
              cards: [{ item: { ...ITEM, explanation: null, translation: null }, sentence: null }],
            },
          ],
        },
      ],
      explanationOf: () => ({ pending: false, failure: 'You are offline.' }),
    });
    await renderThemed(<VocabView {...props} />);

    expect(screen.getByText('You are offline.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry explanation' }));
    expect(props.onRetry).toHaveBeenCalledWith('v1');
  });

  it('deletes an item from its revealed delete action', async () => {
    const props = viewProps();
    await renderThemed(<VocabView {...props} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Delete bellissimo' }));
    expect(props.onDelete).toHaveBeenCalledWith('v1');
  });

  it('reports every search keystroke and says so when nothing matches', async () => {
    const props = viewProps({ groups: [], query: 'xyz' });
    await renderThemed(<VocabView {...props} />);

    expect(screen.getByText('No saved words match "xyz".')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Search saved words'), 'xyz!');
    expect(props.onQueryChange).toHaveBeenCalledWith('xyz!');
  });

  it('starts a review from the toolbar', async () => {
    const props = viewProps();
    await renderThemed(<VocabView {...props} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Review (1)' }));
    expect(props.onStartReview).toHaveBeenCalled();
  });
});

describe('ReviewView render states', () => {
  const card = {
    id: 'v1',
    term: 'bellissimo',
    translation: 'beautiful',
    explanation: 'Very beautiful.',
    sentence: 'Il tramonto era bellissimo.',
  };

  function reviewProps(overrides: Partial<ReviewViewProps> = {}): ReviewViewProps {
    return {
      card,
      state: startReview(['v1', 'v2']),
      started: 2,
      onReveal: jest.fn(),
      onGrade: jest.fn(),
      onClose: jest.fn(),
      onBackToList: jest.fn(),
      ...overrides,
    };
  }

  it('shows the front of the card with the term and the count left, answer hidden', async () => {
    const props = reviewProps();
    await renderThemed(<ReviewView {...props} />);

    expect(screen.getByRole('header', { name: 'bellissimo' })).toBeOnTheScreen();
    expect(screen.getByText('2 left')).toBeOnTheScreen();
    expect(screen.queryByText('Very beautiful.')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Show answer' }));
    expect(props.onReveal).toHaveBeenCalled();
  });

  it('shows the translation and explanation on the back of the card', async () => {
    await renderThemed(
      <ReviewView {...reviewProps({ state: reveal(startReview(['v1', 'v2'])) })} />,
    );

    expect(screen.getByText('beautiful')).toBeOnTheScreen();
    expect(screen.getByText('Very beautiful.')).toBeOnTheScreen();
  });

  it('grades a revealed card as Again or Known', async () => {
    const props = reviewProps({ state: reveal(startReview(['v1'])) });
    await renderThemed(<ReviewView {...props} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Again' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Known' }));
    expect(props.onGrade).toHaveBeenNthCalledWith(1, 'again');
    expect(props.onGrade).toHaveBeenNthCalledWith(2, 'known');
  });

  it('shows the summary when the session is complete', async () => {
    await renderThemed(
      <ReviewView {...reviewProps({ card: null, state: startReview([]), started: 2 })} />,
    );

    expect(screen.getByRole('header', { name: 'Session complete' })).toBeOnTheScreen();
    expect(screen.getByText('Known 0 · Again 0')).toBeOnTheScreen();
  });

  it('explains that there is nothing to review when no item is saved', async () => {
    const props = reviewProps({ card: null, started: 0 });
    await renderThemed(<ReviewView {...props} />);

    expect(screen.getByRole('header', { name: 'Nothing to review yet' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Vocab' }));
    expect(props.onBackToList).toHaveBeenCalled();
  });
});
