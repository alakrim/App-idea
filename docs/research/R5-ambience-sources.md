# R5: Where realistic ambience can come from (beyond Freesound)

**Brief**: `docs/briefs/R5-ambience-sources.md`. **Checked**: 2026-10-12 (container date). **Author**: research worker (haiku-worker). No code changed, no paid calls, no sign-ups. Sample downloads live only in the scratchpad (`/tmp/claude-0/-home-user-App-idea/005bdf22-f3a2-59c7-918d-ae1c7220d1ea/scratchpad/r5/`).

Policy reminder (ADR-0005): CC0 first. CC-BY only with an in-app credits screen. NC, SA, GPL and Sampling+ never. A licence "yes" needs a quoted clause.

---

## TL;DR

1. **Freesound is reachable from this container today.** The brief says `freesound.org` returns 403. On 2026-10-12 the site returns 200, the API returns 401 without a token (the server answers, so it is not blocked), and the HQ MP3 preview CDN `cdn.freesound.org` returns 200 with a 94 s preview file. The 403 did not reproduce. I did not use the user's key. A3 should retry with the key and throttling.
2. **Best CC0 sources that work from here:** Freesound CC0 (through Openverse for search, CDN for previews), BigSoundBank (per-sound "CC0" label, direct MP3/WAV/OGG), OpenGameArt (per-file CC0, direct downloads), Internet Archive (CC0 item search by licence URL, but each compilation's components must be checked). Kenney is CC0 but has almost no ambience beds.
3. **Blocked from here:** Sonniss (403), Pixabay (site and CDN 403), Zapsplat (403), BBC media files (403). Wikimedia Commons API and upload CDN return 429 (rate limit) from this IP. Commons file pages return 200.
4. **AI generation:** ElevenLabs Sound Effects is the only option that supports loops (`loop` parameter, 30 s max) and gives a usable commercial licence on paid plans. Stable Audio (hosted via fal.ai, $0.20 per clip) is a second option under the Stability Community License (free below $1M annual revenue). Meta AudioGen and MAGNeT are CC-BY-NC, so they are red.
5. **OpenRouter has no ambience or sound-effect generation model.** Of 458 models on `/api/v1/models` (fetched 2026-10-12), the only audio-output models are `google/lyria-3-clip-preview` and `google/lyria-3-pro-preview` (music, not ambience) and `openai/gpt-audio(-mini)` (speech). Runtime BYOK generation through OpenRouter is not viable for beds.
6. **Ranked plan:** 18 beds from CC0 sources (17 Freesound, 1 BigSoundBank; four of them need heavier curation because CC0 results are thin) and 6 generated offline with ElevenLabs on a paid plan, for 24 beds in total. Expected pack size at AAC 64 kbps mono is **about 9 MB (45 s average loop) to 12 MB (60 s)**, which fits the ADR-0005 budget of 15 MB. Details in section 5.

---

## 1. Reachability (this container, 2026-10-12)

The proxy's CONNECT line (`HTTP/1.1 200 Connection Established`) is not the site's answer. The table shows the final HTTP status from the origin. Every 403 below came from the origin, most of them Cloudflare (`server: cloudflare`), after a successful CONNECT. The proxy status endpoint reported `recentRelayFailures: []`, so no egress policy block was recorded.

| Host / URL checked | Final status | Notes |
|---|---|---|
| `https://freesound.org/` | 200 | Brief said 403. Not reproduced. |
| `https://freesound.org/apiv2/search/text/` | 401 | Unauthenticated. Server reachable. Key not used. |
| `https://freesound.org/people/DustyWind/sounds/700984/` | 200 | Page licence reads "Creative Commons 0". |
| `https://cdn.freesound.org/previews/700/700984_7943867-hq.mp3` | 200 | 2,124,408 B, `audio/mpeg`. Sample kept. |
| `https://api.openverse.org/v1/audio/` | 200 | Searchable CC0 index of Freesound items. |
| `https://commons.wikimedia.org/` (file pages) | 200 | `File:Cafe_ambiance.ogg` 200. |
| `https://commons.wikimedia.org/w/api.php` | 429 | "You are making too many requests." Persisted after waits. |
| `https://upload.wikimedia.org/...` | 429 | CDN rate limit. No Commons file downloaded. |
| `https://bigsoundbank.com/` and `/UPLOAD/mp3/0740.mp3` | 200 | Sample downloaded. |
| `https://sonniss.com/gameaudiogdc/` | 403 | Cloudflare. Licence text fetched via WebFetch. |
| `https://pixabay.com/` and `cdn.pixabay.com/...` | 403 | Cloudflare. Licence summary fetched via WebFetch. |
| `https://www.zapsplat.com/` | 403 | Cloudflare. Licence page 403 to WebFetch too. |
| `https://sound-effects.bbcrewind.co.uk/` | 200 | Landing page only. |
| `https://sound-effects-media.bbcrewind.co.uk/` | 403 | Media host blocked. |
| `https://mixkit.co/` and `https://assets.mixkit.co/active_storage/sfx/2516/2516.wav` | 200 | Sample downloaded. |
| `https://opengameart.org/sites/default/files/dungeon_ambient_1.ogg` | 200 | Sample downloaded. |
| `https://kenney.nl/assets/interface-sounds` | 200 | Page only. Zip link not located. |
| `https://archive.org/advancedsearch.php`, `archive.org/metadata/...` | 200 | Search and metadata work. Item file (66 MB) not downloaded. |
| `https://soundbible.com/mp3/heavy-rain-daniel_simon.mp3` | 200 | Sample downloaded. |
| `https://getsoundly.com/` | 200 | Site only. Library needs the app or an account (see section 2). |
| `https://openrouter.ai/api/v1/models` | 200 | Full catalogue fetched. |
| `https://elevenlabs.io/`, `fal.ai`, `replicate.com`, `huggingface.co`, `stability.ai` | 200 | Pages fetched. |
| `https://api.elevenlabs.io/` | 404 | API root, not an endpoint. Expected. |

**Tools**: `ffprobe` is at `/usr/bin/ffprobe`. Used for all samples below.

### 1.1 Sample downloads (scratchpad only)

| File | Source | Container | Duration | Sample rate, channels | Bitrate | Size |
|---|---|---|---|---|---|---|
| `fs/sample_fs_700984.mp3` | Freesound 700984 "Ambient Rain Night 1", CC0 (DustyWind), HQ preview | mp3 | 94.20 s | 48 kHz, stereo | 180 kbps | 2,124,408 B |
| `samples/oga_dungeon_ambient_1.ogg` | OpenGameArt "Loopable Dungeon Ambience", CC0 (JaggedStone) | Ogg Vorbis | 94.31 s | 48 kHz, stereo | 160 kbps | 1,626,352 B |
| `samples/bsb_0740.mp3` | BigSoundBank s0740 "Rain and Thunder", CC0 label (Joseph SARDIN) | mp3 | 158.00 s | 48 kHz, stereo | 320 kbps | 6,320,768 B |
| `samples/sb_heavy_rain.mp3` | SoundBible item 2217 "Heavy Rain Wind", Attribution 3.0 | mp3 | 86.47 s | 44.1 kHz, stereo | 212 kbps | 2,288,913 B |
| `samples/mixkit_2516.wav` | Mixkit sfx 2516 | pcm_s16le | 8.50 s | 44.1 kHz, mono | 705 kbps | 751,434 B |

Measured reference for our own pipeline: `assets/ambience/base/base_rain.m4a` is 493,423 B for 60.09 s, which is about 8.2 KB/s (AAC 64 kbps mono). The size estimates in section 5 use that figure.

---

## 2. Libraries: licence, redistribution in app, API, reachability, quality, coverage

Redistribution key: **yes** = a quoted clause allows shipping the raw file in an app binary. **yes (processed)** = allowed as part of a finished product, but raw loops are restricted. **amber** = conditions or unclear. **no** = not for us.

### 2.1 Summary table

| # | Source | Licence (checked) | Redistribution in app | Credit | API / bulk | Reachable here | Quality | Category coverage |
|---|---|---|---|---|---|---|---|---|
| 1 | Freesound (CC0 filter) | CC0 per file | **yes** (CC0; sec 2.2) | none | API v2 (key needed), Openverse index (no key), HQ MP3 preview | Preview CDN 200, API 401 unauth | 44.1–48 kHz, long field recordings, mixed | Good (see 3) |
| 2 | Openverse | Index only, licence per item | Same as Freesound CC0 | none | REST API, no key | 200 | Metadata only | Search tool, not a source |
| 3 | BigSoundBank | Per sound "CC0 (public domain)" label; site licence "CC0-like" | **yes** (per-file CC0; licence text quoted in 2.3) | optional | Direct MP3/OGG/WAV/FLAC/AAC/M4A per sound | 200 | Sample: 48 kHz, 320 kbps MP3, 2 min 38 s (WAV and other formats listed, not probed) | Rain, thunder, some nature |
| 4 | OpenGameArt | Per file (CC0 for the sample) | **yes** for CC0 files only | none (CC0) | Direct file downloads | 200 | 48 kHz Vorbis, 94 s, loopable | Dungeon, cave, a few beds |
| 5 | Internet Archive | Per item (`licenseurl` field) | Only for CC0 items with verified components | varies | advancedsearch and metadata JSON | 200 | Varies | Long, unproduced recordings |
| 6 | Kenney (audio packs) | CC0 | **yes** ("public domain licensed (CC0)") | optional | Zip download from kenney.nl | 200 (page) | Clean one-shots and UI, 100 files per pack | Almost no beds |
| 7 | Wikimedia Commons | Per file: CC0, CC-BY 3.0, CC-BY-SA, etc. | CC0 or PD only (sec 2.4) | CC-BY needs credit | MediaWiki API (rate-limited now) | Pages 200; API and upload 429 | Varies, some 20 min | Some ambience (cafe, campfire, Vienna streets) |
| 8 | SoundBible | Per item (Attribution 3.0 seen on the sample) | **amber**: credit required | Required (CC-BY 3.0) | Direct MP3 | 200 | 44.1 kHz, 212 kbps MP3 | Rain, animals, some ambience |
| 9 | Mixkit sound effects | Mixkit "Sound Effects Free License" (text not retrieved) | **amber**: resale and sublicence restrictions | Not required (FAQ) | Direct WAV/MP3 | 200 (WAV) | 44.1 kHz mono PCM, short (8.5 s sample) | One-shots, few beds |
| 10 | Pixabay | Pixabay Content License | **amber**: "Standalone" prohibition | Not required | No bulk API without key | Site 403, CDN 403 | Varies | Good breadth, not testable here |
| 11 | Zapsplat | Free licence, credit required (secondary sources) | **amber/no**: sharing as-is is a breach (secondary) | Required on free plan | Site downloads | 403 | Varies | Good breadth, not testable here |
| 12 | Sonniss GDC bundles | "Royalty-free" GDC licence (fetched) | **yes (processed)**; raw supply is forbidden | Not required | Bulk download (size and format not checked) | 403 | Studio-grade, per vendor (not verified here) | Good breadth, needs written confirmation |
| 13 | BBC Sound Effects (RemArc) | BBC RemArc terms: personal, educational or research use (secondary) | **no** without a commercial licence | n/a | Site download | Landing 200, media 403 | Broadcast, very high | Excellent, but blocked |
| 14 | Soundly free library | Soundly EULA and SFX licence (secondary) | **unclear**: cleared for commercial use in a project, not sold alone | Not stated | App download | Site 200 | Varies | Not usable without the app |
| 15 | ElevenLabs Sound Effects | Output: user keeps rights; commercial use on paid plans (see 4) | **amber**: needs ToS confirmation for binaries | None | REST API, paid | API root 404 (expected), site 200 | AI, 30 s max, loop option | Any category |
| 16 | Stable Audio (fal.ai, Stability) | Stability Community License | **amber**: free under $1M annual revenue | Not stated | REST via fal.ai | 200 | 44.1 kHz stereo, up to 47 s (Open) | Any category |
| 17 | Meta AudioGen / MAGNeT | CC-BY-NC 4.0 weights | **no** (NC) | n/a | Model weights | 200 | n/a | n/a |

### 2.2 Per-library evidence

**Freesound (CC0 filter).** The page for 700984 reads "Creative Commons 0". Openverse gives `license: "cc0"`, `license_version: "1.0"` for the same item, which matches. The R4 quotes (fetched earlier) stand: the FAQ says CC0 means "you can do pretty much what you want with the sound" and that you "could even sell the sound", and that you "can't claim you are the author!". Licence is per file, so the filter must be applied per item (A3 already requires `license:"Creative Commons 0"`).
- Verdict: **yes**. Attribution is not required, but the FAQ says the author cannot be claimed.
- Caveat for A3: Openverse search is text relevance, so results are noisy ("Mystic Jungle rain" appeared for light rain). Curation by ear is needed.

**Openverse.** Index of CC0 Freesound items, `source=freesound`. Durations are in milliseconds. Used here only for coverage counts (section 3). Not a source of files itself.

**BigSoundBank.** Sound pages carry a licence line, for example "CC0 (public domain): Free and royalty-free" on s0740, with a JSON-LD `"license":"https://bigsoundbank.com/licenses.html"`. The licence page (fetched 2026-10-12) is titled "Royalty-Free Sound License (CC0-like)" and says:
- "Use, including for commercial purposes."
- "Without any restrictions."
- "Share, copy, distribute and communicate the material by all means and in all formats."
- "Nothing is mandatory, but definitely appreciated..." (credit line "Additional sounds: Joseph SARDIN - BigSoundBank.com").
- "Other personalized contract on request."

The "Free and Royalty Free" umbrella text says the files are "made available free of charge and freely for all your projects, whether commercial or not, and worldwide", and the list of underlying licences is "Creative Commons CC0 1.0 Universal", "WTFPL license" and "Public Domain Dedication". The licence text is custom, so the safe rule is: **use only sounds whose page says CC0 explicitly**, and log the page URL in LICENSES.json. The "CC0-like" wording and the "contract on request" line are why I rate it yes with a ledger rather than green.
- Verdict: **yes** for pages labelled CC0. Ask BigSoundBank for written confirmation before shipping a large batch (cheap, one email).

**OpenGameArt.** Sample page reads "License(s): CC0" (JaggedStone, OGG, tags "Ambient, dungeon, effect, loopable"). Licence is per file, and mixes can change it (R4 noted a CC0 + CC-BY mix listed as CC-BY 3.0). Some packs are CC-BY-SA.
- Verdict: **yes** for files marked CC0 only.

**Internet Archive.** `advancedsearch` with `licenseurl:*zero*` and `mediatype:audio` returned 840 audio items. The `licenseurl` field is `creativecommons.org/publicdomain/zero/1.0/`. The sample item "Rain on a Harbor Window - 90 Minute Offline Sleep Audio" (`calm-moments-rain-90min`) says CC0, but its description reads: "Original synthesis by the Calm Moments project. CC0 source component by Joseph SARDIN (BigSoundBank.com)." A CC0 item label does not clear the components. Each component needs its own check.
- Verdict: **yes** only for items with verified components. Good for long sleep-style rain, but these are compilations.

**Kenney.** Support page (fetched): "Yes, all game assets on the asset pages are public domain licensed (CC0)." and "Attribution is not required, but if you choose to give credit you can do so by mentioning "Kenney"." The Interface Sounds page reads "License: Creative Commons CC0" with 100 files. Kenney packs are one-shot UI, impact, RPG and sci-fi sounds. They do not cover beds, so they only help one-shots in v1.1.
- Verdict: **yes**, verify each pack's zip licence file (R4 flag stands).

**Wikimedia Commons.** The reuse page says "Almost all images and other media on Wikimedia Commons are under some kind of free license" and "some licenses require that the original creator be attributed." It does not address app redistribution. Per-file checks (fetched):
- `File:Cafe_ambiance.ogg`: "CC0 1.0 Universal Public Domain Dedication", author Marble Toast, 20 min, Ogg Vorbis 133 kbps.
- `File:Campfire_sound_ambience.ogg`: "Creative Commons Attribution 3.0 Unported", author Glaneur de sons, 1 min, Ogg Vorbis 74 kbps, originally from Freesound sound 29727.
Commons ambience items are a mix. The campfire file is CC-BY and needs a credit. Some Freesound items appear on Commons under CC-BY, so Freesound-origin content does not guarantee CC0.
- Verdict: **yes** for CC0 or PD files. CC-BY only with credits. CC-BY-SA never. The API is currently rate-limited from this IP (429), so bulk search was not possible.

**SoundBible.** Item 2217 "Heavy Rain Wind" (sample) shows "License Attribution 3.0". The about page says: "The free sounds can only if they are under the Creative Commons Attribution, or Public Domain License." and "The Royalty Free Sounds can indeed be used for commercial uses." Nine listing entries on the first page show "Attribution 3.0". The site does not clearly state which items are public domain without checking each item.
- Verdict: **amber**. CC-BY 3.0 needs a credits screen. Allowed under ADR-0005 only with that screen. Use only where the item page says Public Domain.

**Mixkit.** The licence index (fetched) names a "Sound Effects Free License" with a "View License" button, but the text was not returned. The FAQ (fetched) says "Yes, you can use Mixkit Sound Effects for commercial and personal projects." and "Attribution is appreciated but not required." A Mixkit summary page (`/llm-info/`, WebFetch paraphrase, not verified against the licence text) says third parties must not "Rent, license, sublicense, sell, resell or otherwise commercially exploit" the items, and "Items cannot be resold in their original form."
- Verdict: **amber**. Raw sounds shipped in a binary are close to "sublicense or resell" if a user can extract them. Processed loops are safer. The licence text needs retrieving from the page before any use. The clips are short (8.5 s sample), so loops will need stitching.

**Pixabay.** Licence summary (fetched via WebFetch, verbatim): "You cannot sell or distribute Content (either in digital or physical form) on a Standalone basis. Standalone means where no creative effort has been applied to the Content and it remains in substantially the same form". Attribution: "Use Content without having to attribute the author (although giving credit is always appreciated by our community!)" The summary does not say how apps are treated.
- Verdict: **amber**. Raw bundled files are close to the Standalone prohibition (R4 agreed). Not testable here (403).

**Zapsplat.** The licence page and the beginners page both returned 403 to curl and WebFetch. Secondary search summaries say the free tier requires a credit line such as "Sound effects obtained from zapsplat.com", commercial use is allowed, and sharing a file as-is outside a game or film is a breach. These are unverified secondary statements.
- Verdict: **amber/no** for raw files. Requires attribution on the free plan, and the paid Gold plan removes it (not used).

**Sonniss GDC bundles.** Licence text (fetched via WebFetch; quotes verified 2026-10-12):
- Permitted: "Games, films, videos, podcasts, apps and interactive projects all count"
- Restricted: "Licensee may not distribute, publish, sub-license or otherwise supply the sound effects as sound effects to any other person"
- Attribution: "Licensee may use and modify the licensed sound effects for personal and commercial projects without attribution"
- Term: "Licensee may use the licensed sound effects on an unlimited number of projects for the entirety of their life time."
- AI: "the Licensee is expressly prohibited from using any sound effects licensed under this Agreement" "for the purpose of training artificial intelligence technologies"

The "apps" wording is clear. The restriction on supplying sounds "as sound effects" is the risk for raw loops in a binary. Processed, looped and mixed beds are the intended use. The Sonniss site is 403 from here, so the bundle cannot be downloaded and tested.
- Verdict: **yes (processed)**. Get written confirmation for processed loops in a commercial app (R4 flag still open).

**BBC Sound Effects (RemArc).** The licence PDF is on GitHub (`bbcarchdev/Remarc`) and was not retrievable (GitHub page shows only the filename; WebFetch on the BBC licensing page errored). Secondary summaries say the sounds may be used for "personal, educational or research purposes", that commercial use needs separate permission, and that AI training or data mining is not covered by "research". Commons use may be personal only.
- Verdict: **no** for a commercial app without a commercial licence. This is a secondary reading and needs the primary PDF before any final call. Recommend dropping it from the plan.

**Soundly.** Soundly support pages (secondary, via search): sounds in the Pro and Free libraries are "cleared for commercial use", including "video games", and "sounds can't be sold on their own. They have to be used in a project that includes other media". The EULA PDF (fetched) returned binary content, and WebFetch could not read the clauses. Whether the free library needs a sign-up is unconfirmed. The Freesound library inside Soundly is filtered to CC0 by the vendor.
- Verdict: **unclear**. Requires app download, not bulk-friendly, and the licence text was not read. Do not use.

**ElevenLabs and generated audio.** See section 4.

### 2.3 Quoted licence clauses (verbatim where noted)

| Source | Clause (exact wording) | Date checked | URL |
|---|---|---|---|
| CC0 1.0 | (deed) "Waives copyright worldwide." | 2026-10-12 | https://creativecommons.org/publicdomain/zero/1.0/ |
| BigSoundBank | "Royalty-Free Sound License (CC0-like)"; "Use, including for commercial purposes."; "Without any restrictions."; "Share, copy, distribute and communicate the material by all means and in all formats." | 2026-10-12 | https://bigsoundbank.com/licenses.html |
| BigSoundBank (sound page) | "CC0 (public domain): Free and royalty-free" | 2026-10-12 | https://bigsoundbank.com/rain-and-storm-2-s0740.html |
| Kenney | "Yes, all game assets on the asset pages are public domain licensed (CC0)." | 2026-10-12 | https://www.kenney.nl/support |
| Kenney Interface Sounds | "License: Creative Commons CC0" | 2026-10-12 | https://kenney.nl/assets/interface-sounds |
| OpenGameArt sample | "License(s): CC0" | 2026-10-12 | https://opengameart.org/content/loopable-dungeon-ambience |
| Freesound | page licence "Creative Commons 0"; FAQ (R4): "you can do pretty much what you want with the sound" | 2026-10-12 | https://freesound.org/people/DustyWind/sounds/700984/ |
| Commons Cafe ambiance | "CC0 1.0 Universal Public Domain Dedication" | 2026-10-12 | https://commons.wikimedia.org/wiki/File:Cafe_ambiance.ogg |
| Commons Campfire ambience | "Creative Commons Attribution 3.0 Unported" | 2026-10-12 | https://commons.wikimedia.org/wiki/File:Campfire_sound_ambience.ogg |
| SoundBible item 2217 | "License Attribution 3.0" | 2026-10-12 | https://soundbible.com/2217-Heavy-Rain-Wind.html |
| Pixabay summary | "You cannot sell or distribute Content (either in digital or physical form) on a Standalone basis." | 2026-10-12 | https://pixabay.com/service/license-summary/ |
| Mixkit FAQ | "Yes, you can use Mixkit Sound Effects for commercial and personal projects."; "Attribution is appreciated but not required." | 2026-10-12 | https://mixkit.co/free-sound-effects/ |
| Sonniss licence | "Games, films, videos, podcasts, apps and interactive projects all count"; "Licensee may not distribute, publish, sub-license or otherwise supply the sound effects as sound effects to any other person" | 2026-10-12 | https://sonniss.com/gdc-bundle-license/ |
| Internet Archive item | "CC0 source component by Joseph SARDIN (BigSoundBank.com)." | 2026-10-12 | https://archive.org/metadata/calm-moments-rain-90min |
| ElevenLabs ToS (updated 09 Oct 2026) | "Except as expressly set forth herein, as between you and ElevenLabs, you retain all rights in and to your Output."; paid users: "you may use the Services for commercial purposes." | 2026-10-12 | https://elevenlabs.io/terms-of-use |
| Stability (licence overview) | "For researchers, developers, small businesses, and creators with less than $1M in annual revenue" | 2026-10-12 | https://stability.ai/license |
| Stability (FAQ) | "as between you and Stability, you own outputs generated from the Core Models or Derivative Works ... and therefore can use those outputs at your discretion" | 2026-10-12 | https://stability.ai/license |

Unverified paraphrases (flagged in the table above): Mixkit "resell" clause (WebFetch on `/llm-info/`), Zapsplat redistribution (search snippets), BBC research-only use (search snippets), Soundly "cleared for commercial use" (support page via search).

---

## 3. Category coverage (Openverse CC0 index, 2026-10-12)

Counts are Openverse results for `license=cc0`, `source=freesound`, one query per category (page size 20). "Long" means at least 60 s. The Openverse result count is an index estimate, and results are text matches that need listening. This is a coverage signal, not a curated count.

| Category (taxonomy id) | Openverse hits | Of top 20, 60 s+ | Example candidate (Freesound id) |
|---|---|---|---|
| light_rain | 40 | 6 | Mystic Jungle rain (569912) |
| heavy_rain | 15 | 4 | Storm, Bristol (197376), WAV 24-bit |
| rain_on_window | 99 | 16 | roomtone living room (204843) |
| forest_day_birds | 240 | 14 | Birds In Spring (Scotland) (463903) |
| forest_night | 25 | 13 | Forest at night, crickets (328293) |
| ocean_waves | 75 | 16 | Zen Ocean Waves (456899) |
| river_stream | 94 | 10 | Stream River Water Up Close (433589) |
| storm_wind | 145 | 15 | Thunderstorm Ambience 2 (157002) |
| mountain_wind | 33 | 17 | Mountain village morning (276946), needs curation |
| open_field_wind | 11 | 9 | Field ambience 01 (620099) |
| tavern_crowd | 3 | 3 | Small Town Bar 007 (212094) |
| market_crowd | 39 | 17 | Street market, Sao Paulo (410650) |
| city_street_day | 240 | 14 | citystreet3 (36734) |
| city_night | 233 | 16 | Night city atmosphere (237329) |
| battle_field | 3 | 1 | Dropship Ambience (534554), not a battle |
| war_drums | 10 | 1 | War Drums Loop (527829) |
| horse_trot | 4 | 1 | Horse hooves walking, Foley (481917) |
| horse_gallop | 94 | 0 | none 60 s+ |
| carriage_wheels | 2 | 0 | none |
| ship_deck | 0 | 0 | none |
| fireplace_crackle | 0 | 0 | none |
| castle_hall | 0 | 0 | none |
| cafe_soft | 119 | 15 | People talking at cafe (482990) |
| library_quiet | 3 | 3 | Big hall room tone (509477) |
| office_hum | 76 | 17 | Post office ambience (460082) |
| train_interior | 41 | 16 | Train Interior Ambience, London (651591) |
| temple_incense | 1 | 1 | Buddhist temple hum 02 (468041) |
| kitchen_busy | 84 | 11 | Kitchen Ambience (512511) |

Reading: good CC0 supply for rain, wind, water, forest, urban and interior crowds. Thin or absent for fireplace, castle hall, ship deck, battle, gallop, carriage and temple. Those need generation or a different CC0 source.

Note on the 60 s filter: A3 uses 30–600 s durations. A 30 s loop is inside ADR-0005's 30–60 s range, so the counts above understate usable supply, especially for horse_gallop and carriage_wheels.

---

## 4. AI generation

### 4.1 Candidates

| Option | Loop support | Max length | Price (checked) | Output licence | Weights / model licence | Verdict |
|---|---|---|---|---|---|---|
| ElevenLabs Sound Effects (`POST /v1/sound-generation`, model `eleven_text_to_sound_v2`) | `loop` (bool, default false): "Whether to create a sound effect that loops smoothly. Only available for the 'eleven_text_to_sound_v2 model'." | 30 s (`duration_seconds` 0.5–30) | Help centre: 200 credits per default generation (4 effects on the web app); 40 credits per second on the web, capped at 30 s. API rate conflicts across sources: 11 or 20 credits per second. A third-party listing says $0.12 per minute on the API (unverified). Creator plan $22 with about 121,000 credits per month (third party, unverified). | ToS: "you retain all rights in and to your Output"; paid users "may use the Services for commercial purposes"; free plan "only use the Services for non-commercial purposes". Downloadable output "permitted to use such Output outside of the Services but always subject to these Terms". | Closed API. **Best option for offline curated loops.** Needs a paid plan (commercial use). Output is AI, so the copyright position is not settled by this doc. |
| Stable Audio 2.5 via fal.ai (`fal-ai/stable-audio-25/text-to-audio`) | Not stated | Not stated | $0.20 per audio (per generation; length not stated) | Stability Community License tag "Commercial use" on fal. Output ownership: see 4.2. | Hosted only | Second option. Price per clip is simple. Max length must be checked on a paid call. |
| Stable Audio Open 1.0 (weights, HF) | Not stated | Up to 47 s, stereo 44.1 kHz | Free to download. Self-hosting cost not priced. | "Stability AI Community License" | Community License. Revenue threshold $1M per year (licence overview page). | Probably usable under the community tier for an indie studio. The full licence text was not retrieved, so attribution and other terms are unverified. |
| Meta AudioGen (`facebook/audiogen-medium`) | Not stated | Not stated (example 5 s) | n/a | n/a | model card "cc-by-nc-4.0" | **Red**: non-commercial weights. |
| Meta MAGNeT (`facebook/magnet-medium-30secs`) | Not stated | 30 s | n/a | n/a | model card "cc-by-nc-4.0" (code MIT) | **Red**: non-commercial weights. |
| Google Lyria 3 Clip via OpenRouter (`google/lyria-3-clip-preview`) | No loop parameter documented | 30 s, "always generates a 30-second clip" | $0.04 per clip (OpenRouter listing) | Ownership and commercial use not stated on the Gemini music page. Output carries SynthID watermark. | Hosted | **Music model**. Fails "no music" for ambience. Not recommended. |
| Google Lyria 3 Pro via OpenRouter (`google/lyria-3-pro-preview`) | No | Full songs | $0.08 per song | As above | Hosted | Music. Not recommended. |
| OpenRouter, other audio output (`openai/gpt-audio`, `gpt-audio-mini`) | n/a | n/a | $0.0000024 to $0.000064 per token | n/a | Hosted | Speech output only. Not for ambience. |

**OpenRouter check (2026-10-12).** `GET https://openrouter.ai/api/v1/models` returned 458 models. Filtering on `output_modalities` containing `audio` returned only `google/lyria-3-pro-preview`, `google/lyria-3-clip-preview`, `openai/gpt-audio` and `openai/gpt-audio-mini`. No sound-effect or ambience model is listed.

### 4.2 Licence notes

- **ElevenLabs.** Free plan is non-commercial. Paid plans allow commercial use. The ToS does not expressly grant redistribution inside an app binary, but Section 4(a) allows use of downloadable output outside the Services "always subject to these Terms". Treat as **amber** until the user confirms with ElevenLabs. Keep one ledger row per generated file (prompt, model id, date, account tier).
- **Stability.** Community licence: free for organisations under $1M annual revenue. The FAQ says "as between you and Stability, you own outputs generated from the Core Models ... and therefore can use those outputs at your discretion, so long as you do so in compliance with applicable law and our AUP." The Community Licence agreement itself was not retrievable from the page. Rated **amber** until the full text is read.
- **Meta.** CC-BY-NC 4.0 on weights. Red for a commercial app, regardless of output.
- **Lyria.** Output ownership not stated on the Gemini music page. Music, so not used.

### 4.3 Cost per 60 s bed (a) and per chapter (b)

Cost ranges are shown as low to high where sources disagree. All are estimates. Nothing was generated here (no paid calls).

| Use | Model | Cost per 30 s loop | Cost per 60 s bed | Notes |
|---|---|---|---|---|
| (a) offline pack | ElevenLabs, API rate (11 credits/s, or $0.12/min) | $0.06 | $0.12 | Unverified API rate. |
| (a) offline pack | ElevenLabs, web rate (40 credits/s, Creator approx. $0.00018/credit) | $0.22 | $0.44 | Derived from third-party credit count. |
| (a) offline pack | Stable Audio 2.5 via fal | $0.20 per clip | $0.20 if one clip covers 60 s | Clip length unverified. |
| (a) offline pack | Stable Audio Open (self-hosted) | GPU time | GPU time | Not priced. |

For the six generated beds in the plan (30 s loops each), total generation spend is about **$0.36 to $1.32** one time, plus QA time for seams.

(b) **Runtime generation with the user's BYOK key, per chapter.** The cap in ADR-0005 is 2 cues per 1k words. A 4,000-word chapter has at most about 8 cues, and about 4 to 6 unique beds in practice.
- ElevenLabs API rate: 4 to 6 beds x $0.06 = **about $0.24 to $0.36 per chapter**.
- ElevenLabs web rate: 4 to 6 x $0.22 = **about $0.88 to $1.32 per chapter**.
- Stable Audio via fal: 4 to 6 x $0.20 = **about $0.80 to $1.20 per chapter**.
- OpenRouter: **not possible** for ambience (no model).

Verdict on (b): technically possible, but it needs a second paid key (ElevenLabs or fal), which breaks the single OpenRouter BYOK assumption in ADR-0001 and ADR-0003. Latency per generation is not measured. Seam quality from generated loops is not verified. Not recommended for v1. Revisit as a v1.1 option ("generate a missing bed") only with a documented second key.

---

## 5. Ranked plan: 24 high-quality, loop-clean beds

### 5.1 Selection rationale

No analysis logs are in the repo, so the ranking is judgement, not a measured count. It follows the taxonomy's families (nature, weather, urban, interiors, transport, combat, mood) and the common scenes in narrated fiction and non-fiction (rain and weather, forest, water, town crowds, taverns, horses, battles, fireplace and halls). Each bed's source is chosen from the coverage counts in section 3.

### 5.2 The 24 beds

| Rank | Category (id) | Source (first choice) | Licence | Fetchable from this container today | Fallback |
|---|---|---|---|---|---|
| 1 | light_rain | Freesound CC0 (Openverse search, curate) | CC0 | Preview CDN 200 | BigSoundBank rain (CC0 label) |
| 2 | heavy_rain | BigSoundBank s0740 "Rain and Thunder" (CC0) or Freesound storm | CC0 | BSB 200 | Freesound 197376 |
| 3 | rain_on_window | Freesound roomtone / rain (204843 and similar) | CC0 | Preview CDN 200 | ElevenLabs gen |
| 4 | storm_wind | Freesound "Thunderstorm Ambience 2" (157002) | CC0 | Preview CDN 200 | BSB s0740 |
| 5 | forest_day_birds | Freesound "Birds In Spring (Scotland)" (463903) or similar | CC0 | Preview CDN 200 | OGA forest (search) |
| 6 | forest_night | Freesound "Forest at night, crickets" (328293) | CC0 | Preview CDN 200 | none needed |
| 7 | ocean_waves | Freesound "Zen Ocean Waves" (456899) | CC0 | Preview CDN 200 | none needed |
| 8 | river_stream | Freesound "Stream River Water Up Close" (433589) | CC0 | Preview CDN 200 | none needed |
| 9 | open_field_wind | Freesound "Field ambience 01" (620099) | CC0 | Preview CDN 200 | none needed |
| 10 | city_street_day | Freesound "citystreet3" (36734) | CC0 | Preview CDN 200 | Commons CC0 street files |
| 11 | city_night | Freesound "Night city atmosphere" (237329) | CC0 | Preview CDN 200 | none needed |
| 12 | market_crowd | Freesound "Street market, Sao Paulo" (410650) | CC0 | Preview CDN 200 | none needed |
| 13 | cafe_soft | Freesound "People talking at cafe" (482990) | CC0 | Preview CDN 200 | Commons "Cafe ambiance" (CC0, 20 min) |
| 14 | train_interior | Freesound "Train Interior Ambience (London)" (651591) | CC0 | Preview CDN 200 | none needed |
| 15 | mountain_wind | Freesound CC0 wind search, curate for exposed wind | CC0 | Preview CDN 200 | open_field_wind |
| 16 | tavern_crowd | Freesound "Small Town Bar 007" (212094), curate harder | CC0 | Preview CDN 200 | ElevenLabs gen (tavern prompt) |
| 17 | war_drums | Freesound "War Drums Loop" (527829), check licence on page | CC0 (to verify) | Preview CDN 200 | ElevenLabs gen |
| 18 | horse_trot | Freesound "Horse hooves walking, Foley" (481917) | CC0 (to verify) | Preview CDN 200 | ElevenLabs gen |
| 19 | fireplace_crackle | ElevenLabs Sound Effects, loop = true | Paid plan, ToS confirm | Needs paid key (user machine) | base_fire (procedural) |
| 20 | castle_hall | ElevenLabs gen (stone hall, echo, footsteps) | Paid plan, ToS confirm | Needs paid key | library_quiet chain |
| 21 | battle_field | ElevenLabs gen (distant battle, shouts, clash) | Paid plan, ToS confirm | Needs paid key | crowd_murmur |
| 22 | horse_gallop | ElevenLabs gen (gallop, 30 s loop) | Paid plan, ToS confirm | Needs paid key | horse_trot |
| 23 | ship_deck | ElevenLabs gen (wooden deck, ropes, creak, sea) | Paid plan, ToS confirm | Needs paid key | ocean_waves |
| 24 | temple_incense | ElevenLabs gen (temple bell, hushed chant) | Paid plan, ToS confirm | Needs paid key | ritual_chant |

Next wave (not in the 24, same pattern): kitchen_busy (Freesound 512511), office_hum (Freesound 460082), library_quiet (Freesound 509477), carriage_wheels (ElevenLabs), spirit_whispers (no fallback today; generate only).

Counts by source: **Freesound CC0: 17** (ranks 1, 3 to 18 except the BigSoundBank pick; war_drums and horse_trot still need their licence confirmed on the page), **BigSoundBank CC0: 1** (heavy_rain), **ElevenLabs offline: 6** (fireplace_crackle, castle_hall, battle_field, horse_gallop, ship_deck, temple_incense). The exact split is set when A3 curation runs.

Licence decisions beyond plain CC0: the six ElevenLabs beds (ToS check, section 4.2), and the licence confirmation for war_drums and horse_trot. No CC-BY is needed in this plan, so no credits screen is required. SoundBible and Commons CC-BY are kept as fallbacks only.

### 5.3 Pack size at AAC-LC 64 kbps mono

Measured rate from `base_rain.m4a`: 493,423 B for 60.09 s, which is about 8.2 KB/s.

| Loop length | Per bed | 24 beds |
|---|---|---|
| 30 s | about 246 KB | about 5.9 MB |
| 45 s | about 369 KB | about 8.9 MB |
| 60 s | about 492 KB | about 11.8 MB |

The ADR-0005 budget is 15 MB (A3 says "about 15 MB for real beds"). A 60 s loop plan fits with about 3 MB headroom. Keep 63 s windows as A3 says, then trim to 60 s loop regions. Metadata and the ledger add under 0.1 MB.

### 5.4 Is a downloadable "HD ambience pack" a licence change?

No, not by itself. The obligations follow the file, not the delivery route:
- A CC0 file stays CC0 whether it is bundled or downloaded. The ledger still applies.
- CC-BY credits still have to appear in the app (credits screen). Hosting does not remove that.
- Sonniss and Pixabay "supply" or "Standalone" limits still apply, because our CDN would be distributing the files. Downloading them from a CDN is distribution.
- The change is operational. A download cuts APK size by about 12 MB, allows updates without a store release, and needs our own hosting and a first-run network path. The base procedural pack must stay bundled as the offline floor, and the fallback chain must work when the download is missing.

Recommendation: keep the 24 beds bundled in v1 (about 12 MB), and consider the download route for an HD v1.1 pack once hosting is decided.

---

## 6. What to do next (for the architect)

1. **A3 retry (Freesound).** Freesound is reachable from this container. The user's key is needed only for API search (`/apiv2/search/text/`) and the `license` filter. Preview CDN downloads work without it. Confirm with the user before any key use, and throttle to 60 requests per minute.
2. **BigSoundBank.** Send one email for written confirmation of the CC0-like licence and processed loops. Use only sounds labelled CC0 on their page.
3. **Sonniss and Pixabay.** Get written confirmation for processed loops (R4 open issue). Not blocking.
4. **ElevenLabs.** The user should confirm the commercial-licence wording for embedded, processed loops on a paid plan. Generate the six beds offline with `loop: true`, verify seams with the existing verify script, and log each file in `LICENSES.json`.
5. **Remove from the plan:** BBC Sound Effects (no commercial licence), Soundly (unclear), Zapsplat (credit and redistribution), Meta AudioGen and MAGNeT (NC), Lyria (music).
6. **Mixkit.** Read the full Sound Effects Free License text before any use. Current view: amber.

---

## Decisions and assumptions

- **Freesound status**: the brief's 403 did not reproduce. Reported as observed. I did not use the user's key, so A3 must check again with the key.
- **Rank order** is judgement based on taxonomy families and common scenes. No analysis logs exist to measure real frequency.
- **Coverage counts** come from Openverse's text search and are an index signal, not a curated count.
- **Price figures** for ElevenLabs are conflicting across sources, and the credit-to-dollar figure comes from a third-party listing. Treat as order-of-magnitude until the user checks the pricing page with a real account.
- **Stable Audio 2.5 length** is not stated, so the $0.20 per clip figure may cover a shorter or longer clip than 60 s.
- **Secondary sources** are marked wherever used. Quotes are verbatim only where the fetched text was the licence itself.
- **Scratchpad only**: all samples are in `/tmp/claude-0/-home-user-App-idea/005bdf22-f3a2-59c7-918d-ae1c7220d1ea/scratchpad/r5/`. Nothing was written to the repo except this report.

## Evidence

- `curl` reachability checks: section 1 (final status codes after redirects, plus the proxy status endpoint showing `recentRelayFailures: []`).
- `ffprobe` on five samples: section 1.1.
- OpenRouter catalogue: `https://openrouter.ai/api/v1/models`, 458 models, audio-output filter: section 4.1.
- Openverse coverage queries, 28 categories, one query each: section 3.
- Licence fetches via WebFetch (2026-10-12): section 2.3.

## Open issues for the architect

1. Freesound 403 in the brief does not match today's behaviour. Decide whether A3 proceeds with the user's key now.
2. Wikimedia Commons API and upload CDN are rate-limited (429) from this IP. Commons bulk search needs another attempt later or a different path.
3. Sonniss, Pixabay, Zapsplat and BBC media are blocked from this container. Their samples cannot be tested here.
4. ElevenLabs commercial-use wording for embedded, processed loops needs a user check. ToS does not grant redistribution explicitly.
5. Stability Community License full text (revenue definition, attribution) was not retrievable. Needed before the fal or open-weights path.
6. Mixkit "Sound Effects Free License" text not retrieved. Needed before any use.
7. BigSoundBank CC0-like licence: request written confirmation.
8. ElevenLabs API credit rate conflicts across sources (11 vs 20 credits per second). Check the account pricing page before budgeting.
