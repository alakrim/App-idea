import { isNewModel, NEW_MODEL_WINDOW_MS } from './model-badges';

const NOW = 1_800_000_000_000;

describe('isNewModel', () => {
  it('window is 30 days', () => {
    expect(NEW_MODEL_WINDOW_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('badges a model created just now, and one created the millisecond before the window closes', () => {
    expect(isNewModel({ createdAt: NOW }, NOW)).toBe(true);
    expect(isNewModel({ createdAt: NOW - NEW_MODEL_WINDOW_MS + 1 }, NOW)).toBe(true);
  });

  it('stops badging at exactly 30 days', () => {
    expect(isNewModel({ createdAt: NOW - NEW_MODEL_WINDOW_MS }, NOW)).toBe(false);
  });

  it('never badges a model with no date', () => {
    expect(isNewModel({ createdAt: null }, NOW)).toBe(false);
  });

  it('reads the clock it is given, so the same model is new on one day and not on a later one', () => {
    const drama = { createdAt: NOW };
    expect(isNewModel(drama, NOW + NEW_MODEL_WINDOW_MS - 1)).toBe(true);
    expect(isNewModel(drama, NOW + NEW_MODEL_WINDOW_MS)).toBe(false);
  });

  it('keeps a model whose date is ahead of the device clock as new', () => {
    expect(isNewModel({ createdAt: NOW + 60_000 }, NOW)).toBe(true);
  });
});
