// OpenCanvas Image Cache - MV3 service worker.
// Captures right-clicked images into IndexedDB and answers bridge requests
// relayed by content.js.

const DB_NAME = "opencanvas-cache";
const DB_VERSION = 1;
const STORE_NAME = "images";
const MENU_ID = "oc-cache-image";
const MENU_TITLE = "添加到 OpenCanvas 缓存";
const BRIDGE_VERSION = 1;

// ---------- IndexedDB ----------

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("打开 IndexedDB 失败"));
  });
}

async function withStore(mode, run) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      const request = run(store);
      if (request) {
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => reject(request.error || new Error("IndexedDB 请求失败"));
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("IndexedDB 事务失败"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB 事务中止"));
    });
  } finally {
    db.close();
  }
}

function putImage(record) {
  return withStore("readwrite", (store) => store.put(record));
}

function getAllImages() {
  return withStore("readonly", (store) => store.getAll());
}

function getImage(id) {
  return withStore("readonly", (store) => store.get(id));
}

function countImages() {
  return withStore("readonly", (store) => store.count());
}

function clearImages() {
  return withStore("readwrite", (store) => store.clear());
}

// ---------- Badge ----------

async function syncBadge() {
  try {
    const count = await countImages();
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
    if (count > 0) {
      await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
    }
  } catch (err) {
    console.error("[OpenCanvas Image Cache] 同步角标失败", err);
  }
}

// ---------- Capture ----------

function isSupportedUrl(value) {
  if (!value) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "data:";
  } catch {
    return false;
  }
}

function normalizeMime(value) {
  const mime = String(value || "").split(";")[0].trim().toLowerCase();
  return mime || "application/octet-stream";
}

function createId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function deriveName(srcUrl, addedAt) {
  let last = "";
  try {
    const url = new URL(srcUrl);
    if (url.protocol !== "data:") {
      last = url.pathname.split("/").filter(Boolean).pop() || "";
    }
  } catch {
    last = "";
  }
  if (last) {
    try {
      last = decodeURIComponent(last);
    } catch {
      // Keep the raw segment when it is not valid percent-encoding.
    }
  }
  return last || `image-${addedAt}`;
}

async function measureImage(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch (err) {
    console.warn("[OpenCanvas Image Cache] 解码图片尺寸失败，按 0x0 记录", err);
    return { width: 0, height: 0 };
  }
}

async function cacheImage(info, tab) {
  const srcUrl = info.srcUrl || "";
  if (!isSupportedUrl(srcUrl)) {
    throw new Error(`不支持的图片来源: ${srcUrl || "(空)"}`);
  }

  const response = await fetch(srcUrl);
  if (!response.ok) {
    throw new Error(`下载图片失败: HTTP ${response.status}`);
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error("图片内容为空");
  }

  const addedAt = Date.now();
  const record = {
    id: createId(),
    name: deriveName(srcUrl, addedAt),
    mime: normalizeMime(blob.type || response.headers.get("content-type")),
    size: blob.size,
    ...(await measureImage(blob)),
    pageUrl: info.pageUrl || (tab && tab.url) || "",
    pageTitle: (tab && tab.title) || "",
    addedAt,
    blob,
  };

  await putImage(record);
  await syncBadge();
  console.log(
    `[OpenCanvas Image Cache] 已缓存 ${record.name} (${record.mime}, ${record.size} B)`,
  );
}

// ---------- Bridge (service worker side) ----------

function errorMessage(err) {
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}

async function handleList() {
  const records = await getAllImages();
  const items = records
    .map(({ id, name, mime, size, width, height, addedAt }) => ({
      id,
      name,
      mime,
      size,
      width,
      height,
      addedAt,
    }))
    .sort((a, b) => b.addedAt - a.addedAt);
  return { ok: true, data: { items } };
}

async function handleGet(id) {
  if (!id) return { ok: false, error: "缺少 id" };
  const record = await getImage(id);
  if (!record) return { ok: false, error: `未找到图片: ${String(id)}` };
  const dataUrl = await blobToDataUrl(record.blob, record.mime);
  return {
    ok: true,
    data: { id: record.id, name: record.name, mime: record.mime, dataUrl },
  };
}

async function handleClear() {
  await clearImages();
  await syncBadge();
  return { ok: true };
}

async function blobToDataUrl(blob, fallbackMime) {
  // MV3 messaging is JSON-serialized, so a Blob/ArrayBuffer cannot cross the
  // boundary; a base64 data: URL is the transport.
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  const mime = normalizeMime(blob.type || fallbackMime);
  return `data:${mime};base64,${btoa(binary)}`;
}

function handleBridgeMessage(message) {
  const action = message && message.action;
  switch (action) {
    case "list":
      return handleList();
    case "get":
      return handleGet(message.id);
    case "clear":
      return handleClear();
    case "hello":
      return Promise.resolve({ ok: true, data: { version: BRIDGE_VERSION } });
    default:
      return Promise.resolve({ ok: false, error: `未知操作: ${String(action)}` });
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleBridgeMessage(message)
    .then(sendResponse)
    .catch((err) => {
      console.error("[OpenCanvas Image Cache] 处理消息失败", err);
      sendResponse({ ok: false, error: errorMessage(err) });
    });
  return true;
});

// ---------- Wiring ----------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      console.warn(
        "[OpenCanvas Image Cache] 清理旧菜单失败",
        chrome.runtime.lastError.message,
      );
    }
    chrome.contextMenus.create({
      id: MENU_ID,
      title: MENU_TITLE,
      contexts: ["image"],
    });
  });
  void syncBadge();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  cacheImage(info, tab).catch((err) => {
    console.error("[OpenCanvas Image Cache] 缓存图片失败", err);
  });
});

// Keep the badge in sync whenever the service worker wakes up.
void syncBadge();
