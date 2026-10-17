# SND1 handoff (final state of round 2)

Worktree: `/home/user/App-idea/.claude/worktrees/agent-a79e53962e02c2cb4`, branch `worktree-agent-a79e53962e02c2cb4`.
Not pushed.

## Status
- **Verified**: `npm run sounds:verify` (45 of 45 checks: pack-wide plus 40 beds), `npm run sounds:test` (15 node
  tests), `npm run typecheck`, `npm run lint`, `npm run worklet:check`, `npm test` and `npm run bundle:check` (see the
  commit message and the round report for the output tails).
- **Count**: 34 taxonomy category beds installed, each resolving to itself (target was 30). Plus 6 base-pack beds
  (`base_*`, the fallbacks). 40 files in total, 19.85 MB (18.93 MiB), under the 20 MiB budget.
- **Not auditioned by ear.** Everything was measured (loudness, true peak, seam, sample step), not listened to. The
  audition page (`scratchpad/audition/index.html`, outside the repo) is for the user and the architect to listen.

## Sources
- **Sampled (3)**, all Public Domain Mark 1.0, pages on archive.org (Aporee field recordings):
  - `ocean_waves`: "Brighton Beach, East Sussex, UK - Strong sea waves", RorySmith
    (https://archive.org/details/aporee_27515_31722)
  - `forest_day_birds`: "IJhorst, Overijssel, Nederland - Birdsong_Forest_Morning", Jillis Molenaar
    (https://archive.org/details/aporee_72184_84289)
  - `jungle_insects`: "Coastal Forest, Atiu Cookinseln - Coastal Rain Forest at night, no rain.", matthias.feuersenger
    (https://archive.org/details/aporee_54114_61850)
- **Procedural (31 category beds + 6 base)**: recipes in `scripts/sounds/bed-recipes.mjs`, `bed-recipes-v4`.
  The 11 new recipes this round: castle_hall, ship_deck, horse_trot, battle_field, city_street_day, city_night,
  fireplace_crackle, crowd_murmur, market_crowd, tavern_crowd, cafe_soft.
- Rejected by hand: "The Designer's Choice UCS Collection - AMBIENCES" is listed as a candidate for `battle_field` and
  `tavern_crowd`, but it is a grocery checkout. The title and screen do not show that, so a title-only screen is not
  enough. Listen before picking any more sampled candidates.

## Fixes this round
- `tense_heartbeat`: the beat grid is shifted (`HEART_SHIFT`) so the loop seam falls 0.7 s into each beat, in the silence
  after the dub. Seam dRMS is now 2.64 dB (limit 42.7 dB, set by the stem's own window variation). The seam previously
  fell on a thump.
- `forest_night`: carriers and gates are whole cycles per loop, so the stem wraps without a step.
- `market_crowd`: reseeded (1601 to 1641) because its wrap sample step was 6.33x the median against a 6.00x limit. A
  single-sample outlier, not a seam. Same texture, different noise.
- `horse_trot`: the noise fragment had to end in `[out]`, the build failed before this was fixed.

## Known limits
- Seam dRMS for the periodic stems is large (horse_trot 12.9 dB, train_interior 10.3 dB, clock_ticking 5.4 dB) and passes
  only because the rule's p99 limit is that wide. Each stem is periodic and the wrap sample step is within limits, so
  the loop is continuous. The window-level metric just sees a strike on one side of the seam.
- The wrap sample step is near its floor for several beds: city_night 6.36x, base_wind 5.19x. Each limit is raised by
  that bed's own p99.9 ratio, so they pass. The ear audition is the real check.

## Decisions
- Ledger `source` for sampled rows is the page URL. The licence is visible there. The credit line names it.
- Licences: CC0, Public Domain Mark and CC BY 3.0/4.0 only. The Settings credit line is for CC BY only.
- `verify` now runs `sounds:test`. `sounds:verify` stays separate because it decodes 40 files.
- Commit trailer: the harness attribution (Claude Haiku 5.5) and the Claude-Session line.

## Next steps (for the architect)
1. Ear audition of all 40 beds on the page. Replace any bed that loops badly.
2. Pick more sampled beds only after listening to candidates. Good candidates still missing: open_field_wind (the
   Grillen im Wind CC BY item), city_night (Trinity County crickets and cars, PDM), and a voice-free cafe.
3. Give `open_field_wind`, `forest_day_birds` and `jungle_insects` a second look if the ear test disagrees.
