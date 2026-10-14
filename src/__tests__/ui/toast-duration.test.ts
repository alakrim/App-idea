import { toastDurationMs } from '@/ui/toast-timing';

describe('toastDurationMs', () => {
  it('clears a plain toast after a few seconds', () => {
    expect(toastDurationMs({})).toBe(3500);
  });

  it('keeps a toast with an action for at least 8 seconds, so the action can be tapped', () => {
    expect(
      toastDurationMs({ action: { label: 'Connect OpenRouter', onPress: () => undefined } }),
    ).toBe(8000);
  });
});
