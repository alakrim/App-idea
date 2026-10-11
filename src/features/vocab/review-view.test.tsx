import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';

import { startReview, reveal } from './review';
import { ReviewView, type ReviewViewProps } from './review-view';

import type { ReviewCard } from './vocab-data';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

const CARD: ReviewCard = {
  id: 'vocab-1',
  term: 'bellissimo',
  translation: 'beautiful',
  explanation: 'Very beautiful.',
  sentence: 'Il tramonto era bellissimo.',
};

function props(overrides: Partial<ReviewViewProps> = {}): ReviewViewProps {
  return {
    card: CARD,
    state: startReview([CARD.id]),
    started: 1,
    onReveal: jest.fn(),
    onGrade: jest.fn(),
    onClose: jest.fn(),
    onBackToList: jest.fn(),
    ...overrides,
  };
}

type TestNode = ReturnType<typeof screen.getByRole>;

/** The nearest ancestor that takes a share of its row, which is each grade button's wrapper. */
function flexAncestor(node: TestNode | null): TestNode | null {
  for (let current: TestNode | null = node; current; current = current.parent) {
    if (StyleSheet.flatten(current.props.style)?.flex === 1) return current;
  }
  return null;
}

function gradeWrappers() {
  const again = flexAncestor(screen.getByRole('button', { name: 'Again' }));
  const known = flexAncestor(screen.getByRole('button', { name: 'Known' }));
  return { again, known };
}

describe('ReviewView layout', () => {
  it('puts Again and Known side by side in one row, each taking half the width', async () => {
    await renderThemed(<ReviewView {...props({ state: reveal(startReview([CARD.id])) })} />);

    const { again, known } = gradeWrappers();
    expect(again).not.toBeNull();
    expect(known).not.toBeNull();
    expect(again).not.toBe(known);
    expect(again?.parent).toBe(known?.parent);
    expect(StyleSheet.flatten(again?.parent?.props.style)).toMatchObject({ flexDirection: 'row' });
  });

  it('spans the width with the Show answer button before the card is revealed', async () => {
    await renderThemed(<ReviewView {...props()} />);

    const show = screen.getByRole('button', { name: 'Show answer' });
    expect(StyleSheet.flatten(show.parent?.props.style)).toMatchObject({ alignSelf: 'stretch' });
  });

  it('grades a revealed card with the matching verdict', async () => {
    const onGrade = jest.fn();
    await renderThemed(
      <ReviewView {...props({ state: reveal(startReview([CARD.id])), onGrade })} />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Known' }));

    expect(onGrade).toHaveBeenCalledWith('known');
  });
});
