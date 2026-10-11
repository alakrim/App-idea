# src/ui

Design system: tokens (`tokens.ts`), primitives, motion and icons.

**Import rules**

- Only imports from React, React Native and Expo packages, plus `src/core` for shared types. No feature or service imports.
- Use design tokens only. No magic numbers for colour, spacing or radius.
- Every interactive primitive has an `accessibilityLabel` and a 44pt minimum touch target.
