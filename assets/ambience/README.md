# Ambience assets

Beds for the ambience mixer (ADR-0005). Taxonomy ids are in `src/core/analysis/ambience-taxonomy.ts`. The
installed ids and their requires are in `src/audio/installed-beds.ts` and `src/audio/ambience-pack.ts`.

- `beds/`: every installed bed, one `.m4a` per id. Procedural beds come from `npm run sounds:build`
  (`scripts/sounds/build-base-pack.mjs`). Sampled beds come from `npm run sounds:build-open`
  (`scripts/sounds/build-open-pack.mjs`), from the reviewed picks in `curation/picks.json`.
- `beds/manifest.json`: one row per bed.
- `curation/`: the search results for each sampled category (`npm run sounds:curate`, which writes one
  `<category>.json` per target with its candidates, licence evidence and rejections) and `picks.json`, the
  one candidate reviewed per sampled bed. The files are committed so each choice can be reviewed in git.
- `LICENSES.json`: the licence ledger. Every bundled file has a row.

Regenerate the beds only through the build scripts. Do not hand-edit the generated files. Check the pack
with `npm run sounds:verify`, and the scripts with `npm run sounds:test`.

## `beds/manifest.json`

A JSON array. Each entry:

```json
{
  "id": "castle_hall",
  "file": "castle_hall.m4a",
  "durationMs": 60093,
  "loopStartMs": 46.44,
  "loopEndMs": 60046.8,
  "lufs": -28.0,
  "bytes": 494000,
  "sha256": "<64 hex chars>",
  "kind": "bed",
  "source": "procedural",
  "recipeVersion": "bed-recipes-v4"
}
```

`file` is relative to `beds/`. `lufs` is the integrated loudness measured after normalization. A sampled
row also carries `title`, `author`, `sourceUrl` (the page), `license`, `licenseUrl`, `originalSha256` (the
sha256 of the file as downloaded) and `downloadDate`. Its `recipeVersion` is `open-pack-v1`.

**Loop region.** Each file holds two AAC frames (46.44 ms) of loop audio before and after the loop. The
encoder needs those rolls to avoid an onset at its edges. Players must loop only
`[loopStartMs, loopEndMs)`: start there, and on reaching `loopEndMs` seek back to `loopStartMs`.
Playing the whole file would play the rolls and click at each wrap. `durationMs` is the full file length.

**Seam rule.** `verify-pack.mjs` checks the level and the sample step across the loop seam. A stem that
has a sound at the seam, such as a heartbeat thump, is shifted so the seam falls in silence.

## `LICENSES.json`

A JSON array of ledger rows, one per bundled file. In-house rows:

```json
{
  "id": "castle_hall",
  "file": "castle_hall.m4a",
  "license": "Proprietary (generated in-house)",
  "source": "scripts/sounds/build-base-pack.mjs",
  "author": "Lectio",
  "date": "2026-10-17"
}
```

Sampled rows (ADR-0005, amendment 2026-10-17) add the title, the licence URL and the original's sha256.
Their `source` is the **page** the sound came from, because the licence is visible there, not the download
URL. `license` is the licence name: `CC0 1.0`, `Public Domain Mark 1.0` or `CC BY 3.0` / `CC BY 4.0`. CC BY
rows need their credit line, which Settings → Licenses shows. Rows owned by a build script are replaced on
each build of that script. Other rows are kept.
