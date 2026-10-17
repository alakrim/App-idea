package expo.modules.lectiobackground

/**
 * Carries the service's user events (Cancel, timeout) to the Expo module, which forwards them to
 * JavaScript. The sink is set while the module is alive. With no sink, nothing is listening.
 */
internal object ProcessingBus {
  @Volatile
  var sink: ((String, Map<String, Any?>) -> Unit)? = null

  /** Returns false when no JavaScript is listening, so the caller can stop the service itself. */
  fun emitCancel(chapterId: String): Boolean {
    val current = sink ?: return false
    current(EVENT_CANCEL, mapOf("chapterId" to chapterId))
    return true
  }

  fun emitTimeout() {
    sink?.invoke(EVENT_TIMEOUT, emptyMap())
  }

  const val EVENT_CANCEL = "onCancel"
  const val EVENT_TIMEOUT = "onTimeout"
}
