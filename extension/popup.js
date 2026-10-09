const countEl = document.getElementById("count");
const listEl = document.getElementById("list");
const clearBtn = document.getElementById("clear");
const statusEl = document.getElementById("status");

const PREVIEW_COUNT = 5;

function formatSize(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setStatus(text, isError = false) {
  if (!text) {
    statusEl.hidden = true;
    statusEl.textContent = "";
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = text;
  statusEl.dataset.error = isError ? "1" : "0";
}

function render(items) {
  countEl.textContent = items.length > 0 ? `已缓存 ${items.length} 张图片` : "缓存为空";
  listEl.replaceChildren(
    ...items.slice(0, PREVIEW_COUNT).map((item) => {
      const row = document.createElement("li");

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = item.name || item.id;
      name.title = item.name || item.id;

      const meta = document.createElement("span");
      meta.className = "meta";
      const dimensions = item.width && item.height ? `${item.width}×${item.height}` : "尺寸未知";
      meta.textContent = `${formatSize(item.size)} · ${dimensions}`;

      row.append(name, meta);
      return row;
    }),
  );
  clearBtn.disabled = items.length === 0;
}

async function load() {
  try {
    const response = await chrome.runtime.sendMessage({ action: "list" });
    if (!response?.ok) throw new Error(response?.error || "读取缓存失败");
    render(response.data?.items ?? []);
  } catch (err) {
    countEl.textContent = "无法读取缓存";
    listEl.replaceChildren();
    clearBtn.disabled = true;
    setStatus(err instanceof Error ? err.message : String(err), true);
    console.error("[OpenCanvas Image Cache] 读取缓存失败", err);
  }
}

clearBtn.addEventListener("click", async () => {
  clearBtn.disabled = true;
  setStatus("");
  try {
    const response = await chrome.runtime.sendMessage({ action: "clear" });
    if (!response?.ok) throw new Error(response?.error || "清空缓存失败");
    await load();
    setStatus("缓存已清空");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), true);
    console.error("[OpenCanvas Image Cache] 清空缓存失败", err);
    clearBtn.disabled = false;
  }
});

void load();
