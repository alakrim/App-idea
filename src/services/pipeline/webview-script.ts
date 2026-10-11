/*
 * The script the hidden WebView runs after it loads a page. It waits for the load event and then for
 * 1.5 s with no DOM change and no new resource, or for 12 s at most. It then posts the page's HTML
 * back as its only message. It adds no other bridge: the page's own script is not touched.
 */
export const IDLE_MS = 1500;
export const MAX_WAIT_MS = 12_000;

export const RENDER_SCRIPT = `
(function () {
  var sent = false;
  var idleTimer = null;
  function send() {
    if (sent) return;
    sent = true;
    try {
      window.ReactNativeWebView.postMessage(document.documentElement.outerHTML);
    } catch (error) {
      // The host has gone away. Nothing to report to.
    }
  }
  function quietAfterWork() {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = setTimeout(send, ${IDLE_MS});
  }
  try {
    new MutationObserver(quietAfterWork).observe(document, { subtree: true, childList: true, attributes: true });
    new PerformanceObserver(quietAfterWork).observe({ entryTypes: ['resource'] });
  } catch (error) {
    // Observers are missing on very old engines. The timeout below still sends the page.
  }
  window.addEventListener('load', quietAfterWork);
  setTimeout(send, ${MAX_WAIT_MS});
  quietAfterWork();
})();
true;
`;
