package expo.modules.lectiobackground

import android.content.Context
import android.content.Intent
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlin.math.roundToInt

/** What the notification shows: the chapter, a line on its stage, and overall progress in percent. */
data class ProcessingNotice(
  val chapterId: String,
  val title: String,
  val text: String,
  val percent: Int,
)

/** The JavaScript side of a notice. Progress arrives as a fraction from 0 to 1. */
class ProcessingNoticeRecord : Record {
  @Field var chapterId: String = ""
  @Field var title: String = ""
  @Field var text: String = ""
  @Field var progress: Double = 0.0

  fun toNotice(): ProcessingNotice = ProcessingNotice(
    chapterId = chapterId,
    title = title,
    text = text,
    percent = (progress * 100).roundToInt().coerceIn(0, 100),
  )
}

/** Intent extras carry a notice into the service, so the service can start or update the notification. */
internal object NoticeIntents {
  private const val EXTRA_CHAPTER_ID = "chapterId"
  private const val EXTRA_TITLE = "title"
  private const val EXTRA_TEXT = "text"
  private const val EXTRA_PERCENT = "percent"

  fun build(context: Context, action: String, notice: ProcessingNotice): Intent =
    Intent(context, ProcessingService::class.java)
      .setAction(action)
      .putExtra(EXTRA_CHAPTER_ID, notice.chapterId)
      .putExtra(EXTRA_TITLE, notice.title)
      .putExtra(EXTRA_TEXT, notice.text)
      .putExtra(EXTRA_PERCENT, notice.percent)

  /** The notice an intent carries. Missing extras fall back to an empty notice, never a crash. */
  fun read(intent: Intent?): ProcessingNotice = ProcessingNotice(
    chapterId = intent?.getStringExtra(EXTRA_CHAPTER_ID).orEmpty(),
    title = intent?.getStringExtra(EXTRA_TITLE).orEmpty(),
    text = intent?.getStringExtra(EXTRA_TEXT).orEmpty(),
    percent = intent?.getIntExtra(EXTRA_PERCENT, 0) ?: 0,
  )

  /** The service intent the notification's Cancel action sends. It carries only the chapter id. */
  fun cancel(context: Context, chapterId: String): Intent =
    Intent(context, ProcessingService::class.java)
      .setAction(ProcessingService.ACTION_CANCEL)
      .putExtra(EXTRA_CHAPTER_ID, chapterId)

  fun chapterIdOf(intent: Intent?): String = intent?.getStringExtra(EXTRA_CHAPTER_ID).orEmpty()
}
