# src/features

One folder per feature (`library`, `series`, `chapter`, `player`, `settings`, `ask`): UI components and hooks.

**Import rules**

- May import from `src/ui`, `src/audio`, `src/services`, `src/db` and `src/core`.
- Never import from `app/` (routes compose features; features do not know about routes).
- Features do not import each other directly. Share through `src/ui` or `src/core`.
