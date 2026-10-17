# D1: Folder maps (docs only, no code changes)

## Goal
Cut session-start token cost. A future session should read one short `README.md` map instead of listing and opening dozens of files. Docs only: do not change any `.ts`/`.tsx`/config file.

## Scope
Rewrite or add these READMEs:
1. Update the existing top-level maps: `src/core/README.md`, `src/features/README.md`, `src/services/README.md`, `src/db/README.md`, `src/audio/README.md`, `src/ui/README.md`. Some are stale (for example `src/core/README.md` still says "Planned subfolders"). **Keep each file's existing "Import rules" section verbatim** and add the map around it.
2. Add short maps for the biggest subfolders: `src/features/settings`, `src/features/player`, `src/features/chapter`, `src/core/extract`, `src/core/text`, `src/core/pipeline`, `src/services/pipeline`, `src/services/openrouter`.

## Map format
- Top-level maps: at most 40 lines. Subfolder maps: at most 15 lines.
- Sections: **Purpose** (1-2 lines), **Layout** (one line per subfolder or key file: what it does), **Entry points** (the 2-5 files to open first, with the main exported functions or components), **Gotchas** (non-obvious rules, for example the zustand `useStore` rule, the font-size > 0 rule, `.nullable()` not `.optional()` in LLM schemas; take them from `docs/CONVENTIONS.md` and `docs/archive/STATE-history.md` only when you need to confirm one), **Tests** (where they live and the command).
- Derive everything from the code: read file names, exports and top-of-file comments. Do not guess. If you are unsure about a file, say what you verified and leave the rest out.
- No file lists longer than needed: group test files and fixtures in one line.

## Out of scope
Code changes, `docs/ARCHITECTURE.md`, `docs/STATE.md` (the architect updates it), `docs/research/*`, `docs/archive/*`.

## Verification
- `git diff --stat` shows only `README.md` files and no code.
- Every path you mention exists (check with `ls`; paste the check).
- `wc -l` of each README respects the limits (paste output).
- Do not commit. Report back with the standard report format.
