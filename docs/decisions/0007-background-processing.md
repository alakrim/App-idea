# ADR-0007: Chapter processing survives leaving the app

**Status**: accepted (2026-10-17)

## Context
The user reports, again, that leaving the app freezes chapter processing (narration, analysis and overall progress). The architect traced the cause:
- The pipeline runs on the JS thread. The only measure that keeps it alive is `expo-keep-awake`, which only keeps the **screen** on while the app is in the foreground. It does nothing once the app is in the background.
- Android 14+ freezes a cached (backgrounded, no foreground service) process within seconds, and Doze cuts its network. In-flight `fetch` calls then die or hang until the 60 s timeout.
- `PipelineQueue.drain()` drops a chapter from the queue after **any** failure except AUTH. So a NETWORK or TIMEOUT failure caused by the freeze ends the run for good, and the user sees a stalled or failed chapter.
- Playback sometimes masks the problem: expo-audio's media foreground service keeps the process alive while the voice plays.

## Decision
1. **Android foreground service while the queue is busy.** A local Expo module (Kotlin, wired by a config plugin, following the `plugins/crash-reporter` pattern) runs a foreground service while any chapter is queued or running:
   - type `dataSync`, with a `FOREGROUND_SERVICE_DATA_SYNC` permission
   - a partial wake lock and a Wi-Fi lock (high-perf) held only while the service runs
   - an ongoing, low-importance notification channel "Chapter processing", with the chapter title, the stage and a determinate progress bar; tap opens the chapter, and a **Cancel** action cancels it
   - the service is started from JS when the queue goes busy (the app is in the foreground then) and stopped when it goes idle
   - Android 15's `onTimeout` (the 6 h/day `dataSync` budget) stops the service cleanly. JS keeps the queue intact and resumes it on the next foreground.
   - `POST_NOTIFICATIONS` (Android 13+) is requested once, with a designed explainer, the first time a chapter is queued. Denial does not block processing: the service still runs, it just shows no notification in the shade.
2. **Transient failures never end a run.** NETWORK, TIMEOUT, RATE_LIMITED (retryable) and 5xx failures keep the chapter in the queue in a `waiting` state with exponential backoff (5 s → 5 min, with jitter). The queue retries immediately when the app returns to the foreground or when connectivity returns. Only non-retryable failures (bad input, unsupported language, credits) leave the queue. AUTH keeps its existing pause.
3. **Resumes are cheap.** Every stage already resumes at the first unfinished unit (narration segment, translation chunk), so a retry never re-buys finished work.
4. **iOS** (later): background processing is limited there. Plan a `BGProcessingTask` plus "continue while the voice plays" when iOS work starts. Out of scope now.

## Consequences
- The persistent notification is the honest, premium pattern users expect from download-style work (podcast apps, offline maps).
- The app gains the `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC` and `POST_NOTIFICATIONS` permissions.
- Device verification is required: Jest cannot run the Kotlin service. The test plan is in brief BG1.
