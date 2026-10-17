# QA-B: Player and audio (2026-10-13)

_Read-only audit by a haiku-worker (brief Q1), with probes run in a scratch copy. The architect spot-verified two findings:_
- _P1-1: `app/player.tsx` effect `if (chapterId && chapterId !== loadedChapterId) playChapter(chapterId)` re-plays the route chapter after an auto-advance._
- _P1-3: `playback-controller` / `player-provider` never read settings._

_No P0 was found._

## P1
1. **Auto-advance bounces back to the chapter the player was opened with**:
   - Reproduced: the content history reads `1:loading 1:ready 2:loading 1:loading 1:ready`.
   - Every entry point opens `/player?chapterId=`.
   - Fix: react only to changes of the route param (keep a ref of the last one handled). Keep the probe as the regression test. S.
2. **Ambience ignores the transport** (reproduced):
   - Beds keep playing after pause, after the end, on an unavailable chapter, and after the sleep timer.
   - Ducking releases on pause, so beds get **7 dB louder**.
   - Fix: beds follow the transport, with a ~350 ms debounce, a fade on pause, end, error and unavailable, and a fade with the sleep timer. Ducking only applies while the voice plays. M.
3. **Saved ambience settings never reach playback**:
   - The settings sliders only write to the store.
   - The controller uses its own in-memory default.
   - Ducking is a hard-coded 7 dB.
   - The level ranges disagree: settings −30…−14, engine −40…0, schema −60…0.

   Fix: the controller applies the settings (enabled, level, ducking) on load and on change; one shared range constant; in-player changes write back to settings. M.
4. **An engine error during playback is silent**: the UI shows Play, which calls into the errored player. Fix: map the engine error to the content error state, with "Try again" that resumes. S.
5. **A processing chapter is treated as complete when the pipeline reports `idle` or `cancelled`** (reproduced: `final` flips to true):
   - The player plays to the end and auto-advances.
   - The watch on narration stops.

   Fix: `final` only on `ready` or `failed`; N3's stall and reconnect states count as narrating. S-M.
6. **Settings previews play over the narration**, and previews on two narrator cards can overlap. Fix: one preview player owned by the playback layer that pauses the narration and resumes it. S-M.

## P2
1. **Re-entrant state fan-out**: a stale `ended` arrives after `paused` when auto-advance runs (reproduced). Fix: defer the advance. S.
2. **A superseded load can move the newer chapter's position** (reproduced). Fix: a load sequence number. S.
3. **`dispose()` during a pending `load()` leaks two native players** (reproduced). S.
4. **A seek made before the first load settles is overwritten** by the start position (reproduced). S.
5. **Segment swap churn**: every boundary drops and re-requests audio focus, removes and recreates the media foreground notification, and rebuilds the media session (confirmed in the native source). The gap is unmeasured. **S1 must measure it.** The long-term fix is J1.
6. **Lock screen**: no skip and no next/previous chapter, the native seek works per segment, and headset and Bluetooth buttons don't reach the engine. Fix: a native media-session bridge. L.
7. **`doNotMix` pauses the narration for navigation prompts** (no ducking). Decision: lock-screen controls vs ducking.
8. **The ambience AudioContext opens an exclusive stream** at first play and is never suspended (battery hypothesis). Fix: create it lazily, then suspend and resume. M.
9. **Memory for decoded beds**: about 11.5 MB per mono 60 s bed, with a 4-bed cache, and more cache misses with 50+ beds. Fix: decode at a lower rate and size the cache by bytes. M.
10. **~4 Hz re-renders** of the whole player, the sentence list and the scrubber ticks. Fix: isolate the parts that tick, memoise, draw ticks once. M.
11. **Mini player**: the gesture is rebuilt on every render, and there is a button inside a button. S.
12. **Synced text stops following silently** after a long jump. S.
13. **Sentence timing is a character-weighted estimate**: drift is unmeasured, and it becomes P1 for learners if over 0.5 s (J2).
14. **Repeat-sentence overshoots by up to 250 ms.** Fix: schedule the seek from the predicted position. S-M.
15. **Resume point is per series, not per chapter**: going back to a chapter restarts it. Needs a migration (coordinate with QA-A). M.
16. **The progressive scrubber's total grows** as narration arrives. It needs copy or design. S.
17. **Failure copy blames the connection** for local errors. S.
18. **Sentence skip is hold-only for screen readers** (overlaps QA-C). S.

## P3
- The interruption path is dead in production (document or delete it).
- The sleep ticker runs at 250 ms, and the countdown shows 0:00 during its 10 s fade.
- Speed resets to 1× on every launch.
- The preview cache is never evicted.
- One native player per narrator card.
- `sentenceEnd` is exclusive in one place and inclusive in another.

## Verified OK
- Sleep-timer maths.
- Worklet rules.
- The mixer token guard and loop region.
- Bed planning and diffing.
- Speed bounds.
- Pitch preserved on Android.
- Position saver flush (worst case ~5 s lost on a kill).
- Lock-screen artwork.
- The incident 3 fix holds.
- Progressive append.
- Paragraph mapping.

## Bigger jumps
1. **J1**: a gapless single-player chapter with a native media session (±15/30 s, previous/next chapter, one notification; the base for Android Auto). L.
2. **J2**: real sentence timing from aligning the decoded audio, the base for smart speed. M-L.
3. **J3**: ambience as a controller-owned state machine; fixes P1-2, P1-3, P2-8 and P2-9 together. M.
4. **J4**: a written audio-focus policy plus a device test matrix. M.
5. **J5**: a listening model: per-chapter resume, speed per series, bookmarks, smart speed. M.
6. **J6**: learner tools: A-B loop, shadowing (needs the microphone), vocab review. L.
7. **J7**: battery-aware UI ticks and screen-off mode. M.
8. **J8**: Android Auto / MediaBrowser service. L.

## S1 device checklist additions
- Measure the swap gap, and watch logcat for an FGS start exception.
- Navigation-prompt behaviour.
- Battery over 30 min paused with beds.
- Native heap with 4 decoded beds.
- Sentence drift over about 10 sentences.
