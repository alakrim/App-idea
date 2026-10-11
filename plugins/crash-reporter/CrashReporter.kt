package __PACKAGE__

import android.app.Application
import android.content.Context
import android.os.Build
import android.util.Log
import java.io.File
import java.io.IOException
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Keeps the last crash on the device so the next launch can show it (brief X2).
 *
 * One uncaught-exception handler also covers fatal JavaScript errors. In a release build React
 * Native turns them into a Java exception (react-native 0.86, ReactAndroid/src/main):
 *  - ExceptionsManagerModule.reportException throws JavascriptException when isFatal is true.
 *  - ReactInstance.reportJsException catches it and passes it to the host's exception handler,
 *    ReactHostImpl.handleHostException.
 *  - That calls ReactHostDelegate.handleInstanceException. Expo's delegate (ExpoReactHostFactory,
 *    expo/android) rethrows when no ReactNativeHostHandler is registered.
 * So the exception reaches the thread's uncaught handler. The JavaScript handler in index.js writes
 * the JavaScript stack first, and this handler appends the native report to it.
 */
object CrashReporter {
  /** The report the next launch shows. The JavaScript handler writes the same file. */
  const val LAST_CRASH_FILE_NAME = "lectio-last-crash.txt"

  /** The report kept after the user taps Continue, so Diagnostics can still show it. */
  const val PREVIOUS_CRASH_FILE_NAME = "lectio-last-crash.prev.txt"

  private const val TAG = "LectioCrash"
  private const val MAX_REPORT_CHARS = 256 * 1024
  private const val NATIVE_SECTION_HEADER = "\n--- Native (Java/Kotlin) exception ---\n"

  /** Installs the handler. Call it first in Application.onCreate, before React starts. */
  fun install(application: Application) {
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      try {
        appendNativeReport(application, thread, throwable)
      } catch (failure: Exception) {
        Log.e(TAG, "Could not write the crash report", failure)
      } finally {
        // Always delegate, so the process dies as Android expects after an uncaught exception.
        previous?.uncaughtException(thread, throwable)
      }
    }
  }

  /** The pending report, or null when none is waiting or it cannot be read. */
  fun readPendingReport(context: Context): String? {
    val file = File(context.filesDir, LAST_CRASH_FILE_NAME)
    return try {
      if (file.isFile) file.readText().takeIf { it.isNotBlank() } else null
    } catch (failure: IOException) {
      Log.e(TAG, "Could not read the crash report", failure)
      null
    }
  }

  /** Moves the pending report to the previous slot, then clears the pending one. */
  fun keepAsPrevious(context: Context) {
    val pending = File(context.filesDir, LAST_CRASH_FILE_NAME)
    if (pending.isFile) {
      pending.copyTo(File(context.filesDir, PREVIOUS_CRASH_FILE_NAME), overwrite = true)
    }
    pending.delete()
  }

  /** Clears the pending report without keeping it. Used when the crash screen cannot be shown. */
  fun discardPending(context: Context) {
    File(context.filesDir, LAST_CRASH_FILE_NAME).delete()
  }

  private fun appendNativeReport(context: Context, thread: Thread, throwable: Throwable) {
    val native = formatNativeReport(throwable, thread.name, System.currentTimeMillis())
    val pending = File(context.filesDir, LAST_CRASH_FILE_NAME)
    val existing = if (pending.isFile) pending.readText() else ""
    // A JavaScript report written moments earlier in this same crash stays first.
    val combined = if (existing.isBlank()) native else existing + NATIVE_SECTION_HEADER + native
    writeAtomically(context.filesDir, LAST_CRASH_FILE_NAME, combined.take(MAX_REPORT_CHARS))
  }

  /** Writes to a temporary file and renames it, so a crash mid-write never leaves a half report. */
  private fun writeAtomically(directory: File, name: String, text: String) {
    val temporary = File(directory, "$name.tmp")
    temporary.writeText(text)
    if (!temporary.renameTo(File(directory, name))) {
      throw IOException("Could not replace $name")
    }
  }

  /** Plain text in the same layout as the JavaScript report, with the full cause chain. */
  internal fun formatNativeReport(
    throwable: Throwable,
    threadName: String,
    timestampMillis: Long,
  ): String {
    val trace = StringWriter()
    PrintWriter(trace).use { throwable.printStackTrace(it) }
    return buildString {
      appendLine("Lectio crash report")
      appendLine("Kind: native uncaught exception")
      appendLine("Time: ${isoTimestamp(timestampMillis)}")
      appendLine("Thread: $threadName")
      appendLine("App version: ${BuildConfig.VERSION_NAME}")
      appendLine("Android: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
      appendLine("Device: ${Build.MANUFACTURER} ${Build.MODEL}")
      appendLine()
      append(trace.toString())
    }
  }

  private fun isoTimestamp(millis: Long): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US).format(Date(millis))
}
