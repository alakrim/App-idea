# Lectio test build (Android)

This branch holds exactly **one** installable build: the latest. App code lives on `claude/serene-hypatia-73g7qo`.

| File | Code commit | Size | SHA-256 |
|---|---|---|---|
| `lectio-0.1.0-4136bd3-arm64.apk` | `4136bd3` | 62.2 MB | `1bcda7b709befabe843c2eb8c505e9b50ab4b453f4d29208e129dfdcce2c9bb2` |

## Install
1. On the phone, open the `.apk` above on GitHub (signed in) and tap **Download** (or "View raw").
2. Open the downloaded file. If Android asks, allow "Install unknown apps".
3. Tap **Install**. It installs over any earlier Lectio build and keeps your library.

## What to test
1. When the "Keep going in the background" sheet appears, tap **Allow**.
2. **Smooth voice:** play a chapter for 10 minutes or more. Then open Settings → About, tap the version 7 times, open **Diagnostics → Playback health**, tap **Copy report** and paste it to Claude.
3. **Background:** lock the phone for 10 minutes, then switch apps for 10 minutes. Processing should continue.
4. **Listen now:** add a long chapter. Note the seconds until **Listen now** appears.
5. **Short sounds:** a navigation prompt or a notification should lower the voice, not pause it. A phone call pauses it. After the call it stays paused until you press play.
6. **No double charges:** install over the old build and play a chapter that was already narrated. It should not buy the narration again.
