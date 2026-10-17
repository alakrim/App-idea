import { shouldExplainNotifications } from './notification-rule';

describe('shouldExplainNotifications', () => {
  it('explains once, before the system has asked', () => {
    expect(shouldExplainNotifications('undetermined', false)).toBe(true);
  });

  it('stays quiet once the user has answered the explainer', () => {
    expect(shouldExplainNotifications('undetermined', true)).toBe(false);
  });

  it('stays quiet when the system permission is already decided', () => {
    expect(shouldExplainNotifications('granted', false)).toBe(false);
    expect(shouldExplainNotifications('denied', false)).toBe(false);
  });
});
