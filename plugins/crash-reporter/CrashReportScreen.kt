package __PACKAGE__

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.io.IOException

/**
 * The screen MainActivity shows instead of React when the last launch crashed (brief X2).
 *
 * It is built in code and never reads the JavaScript bundle, so it still works when the bundle is
 * what failed. Colours match the app's dark theme.
 */
object CrashReportScreen {
  private const val TAG = "LectioCrash"
  private const val PREVIEW_LINES = 40
  private const val GUTTER_DP = 16
  private const val TOP_DP = 24
  private const val GAP_DP = 12
  private const val BUTTON_HEIGHT_DP = 48
  private const val BUTTON_RADIUS_DP = 10
  private const val BORDER_DP = 1
  private const val TITLE_SP = 22f
  private const val BODY_SP = 14f
  private const val MONO_SP = 12f
  private const val SUBTITLE_ALPHA = 0.72f
  private val BACKGROUND = Color.parseColor("#0D0E12")
  private val TEXT = Color.parseColor("#ECE8E1")
  private val ACCENT = Color.parseColor("#E8A84A")

  /**
   * Shows [report] on [activity]. [onContinue] runs when the user taps Continue, or straight away
   * if the screen cannot be shown, so a failure here never blocks the app.
   */
  fun present(activity: Activity, report: String, onContinue: () -> Unit) {
    try {
      activity.setContentView(buildContent(activity, report, onContinue))
    } catch (failure: Exception) {
      Log.e(TAG, "Could not show the crash screen; continuing", failure)
      CrashReporter.discardPending(activity)
      onContinue()
    }
  }

  private fun buildContent(activity: Activity, report: String, onContinue: () -> Unit): View {
    val title = TextView(activity).apply {
      text = "Lectio closed unexpectedly"
      setTextColor(TEXT)
      textSize = TITLE_SP
      typeface = Typeface.DEFAULT_BOLD
    }
    val subtitle = TextView(activity).apply {
      text = "Copy the report and send it to us, then tap Continue."
      setTextColor(TEXT)
      textSize = BODY_SP
      alpha = SUBTITLE_ALPHA
    }
    val preview = TextView(activity).apply {
      text = report.lineSequence().take(PREVIEW_LINES).joinToString("\n")
      setTextColor(TEXT)
      typeface = Typeface.MONOSPACE
      textSize = MONO_SP
      setTextIsSelectable(true)
    }
    val scroll = ScrollView(activity).apply { addView(preview) }

    val root = LinearLayout(activity).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(BACKGROUND)
      // Pads the content clear of the status and navigation bars on every Android version.
      fitsSystemWindows = true
      setPadding(
        activity.dp(GUTTER_DP),
        activity.dp(TOP_DP),
        activity.dp(GUTTER_DP),
        activity.dp(GUTTER_DP),
      )
    }
    root.addView(title, matchWidth(activity, 0))
    root.addView(subtitle, matchWidth(activity, GAP_DP / 2))
    root.addView(
      scroll,
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f).apply {
        topMargin = activity.dp(GAP_DP)
      },
    )
    root.addView(
      actionButton(activity, "Copy report", primary = false) { copyReport(activity, report) },
      matchWidth(activity, GAP_DP),
    )
    root.addView(
      actionButton(activity, "Share report", primary = false) { shareReport(activity, report) },
      matchWidth(activity, GAP_DP),
    )
    root.addView(
      actionButton(activity, "Continue", primary = true) { continueLaunch(activity, onContinue) },
      matchWidth(activity, GAP_DP),
    )
    return root
  }

  private fun matchWidth(context: Context, topGapDp: Int): LinearLayout.LayoutParams =
    LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = context.dp(topGapDp) }

  private fun actionButton(
    activity: Activity,
    label: String,
    primary: Boolean,
    onClick: () -> Unit,
  ): Button =
    Button(activity).apply {
      text = label
      isAllCaps = false
      textSize = BODY_SP
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(if (primary) BACKGROUND else ACCENT)
      minHeight = activity.dp(BUTTON_HEIGHT_DP)
      // Flat buttons: no shadow or press lift, so the dark screen stays uncluttered.
      stateListAnimator = null
      background = GradientDrawable().apply {
        cornerRadius = activity.dp(BUTTON_RADIUS_DP).toFloat()
        if (primary) {
          setColor(ACCENT)
        } else {
          setColor(Color.TRANSPARENT)
          setStroke(activity.dp(BORDER_DP), ACCENT)
        }
      }
      setOnClickListener { onClick() }
    }

  private fun copyReport(context: Context, report: String) {
    val clipboard = context.getSystemService(ClipboardManager::class.java)
    clipboard.setPrimaryClip(ClipData.newPlainText("Lectio crash report", report))
    Toast.makeText(context, "Copied", Toast.LENGTH_SHORT).show()
  }

  private fun shareReport(activity: Activity, report: String) {
    val send = Intent(Intent.ACTION_SEND)
      .setType("text/plain")
      .putExtra(Intent.EXTRA_SUBJECT, "Lectio crash report")
      .putExtra(Intent.EXTRA_TEXT, report)
    try {
      activity.startActivity(Intent.createChooser(send, "Share crash report"))
    } catch (failure: ActivityNotFoundException) {
      Log.e(TAG, "No app can share the crash report", failure)
      Toast.makeText(activity, "No app can share text here", Toast.LENGTH_SHORT).show()
    }
  }

  /** Keeps the report for Diagnostics, then loads the app. A failed copy never blocks launch. */
  private fun continueLaunch(activity: Activity, onContinue: () -> Unit) {
    try {
      CrashReporter.keepAsPrevious(activity)
    } catch (failure: IOException) {
      Log.e(TAG, "Could not keep the crash report; discarding it", failure)
      CrashReporter.discardPending(activity)
    }
    onContinue()
  }

  private fun Context.dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
