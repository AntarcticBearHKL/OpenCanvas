// OpenCanvas Image Cache - content script bridge.
// Runs on the OpenCanvas origin and relays window.postMessage requests from
// the page to the extension service worker.

(() => {
  const PAGE_SOURCE = "opencanvas-app";
  const EXTENSION_SOURCE = "opencanvas-browser-cache";
  const BRIDGE_VERSION = 1;
  const ORIGIN = window.location.origin;

  function postToPage(message) {
    window.postMessage(message, ORIGIN);
  }

  function postReady() {
    postToPage({ source: EXTENSION_SOURCE, type: "ready", version: BRIDGE_VERSION });
  }

  function postResponse(requestId, ok, data, error) {
    const message = { source: EXTENSION_SOURCE, type: "response", requestId, ok };
    if (error !== undefined) message.error = error;
    if (data !== undefined) message.data = data;
    postToPage(message);
  }

  async function relay(requestId, action, id) {
    if (!chrome.runtime?.id) {
      // Extension was updated/reloaded while the page stayed open.
      const error = "扩展上下文已失效，请刷新页面后重试";
      console.error(`[OpenCanvas Image Cache] ${error}`);
      postResponse(requestId, false, undefined, error);
      return;
    }
    try {
      const response = await chrome.runtime.sendMessage({ action, id });
      if (!response) {
        postResponse(requestId, false, undefined, "扩展后台未返回结果");
        return;
      }
      postResponse(requestId, Boolean(response.ok), response.data, response.error);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error("[OpenCanvas Image Cache] 转发请求失败", err);
      postResponse(requestId, false, undefined, error);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.origin !== ORIGIN) return;
    const data = event.data;
    if (!data || data.source !== PAGE_SOURCE || data.type !== "request") return;

    const requestId = data.requestId;
    if (typeof requestId !== "string" || !requestId) return;

    if (data.action === "hello") {
      postResponse(requestId, true, { version: BRIDGE_VERSION });
      postReady();
      return;
    }

    void relay(requestId, data.action, data.id);
  });

  postReady();
})();
