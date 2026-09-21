# OpenCanvas Image Cache（浏览器扩展）

把任意网页上右键的图片缓存到扩展本地，再通过页面桥接把图片提供给 OpenCanvas 的素材节点使用。纯 MV3 原生 JavaScript，无框架、无构建步骤、无后端、无上传。

## 安装（加载未打包扩展）

1. 打开 Chrome（Edge 同理），访问 `chrome://extensions`（Edge 为 `edge://extensions`）。
2. 打开右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本目录 `extension/`。
4. 列表中出现「OpenCanvas Image Cache」即安装成功。

## 使用

1. 在任意网页的图片上右键，选择「添加到 OpenCanvas 缓存」。
2. 扩展会用 `<all_urls>` 主机权限在后台直接抓取图片字节（绕开页面 CORS 限制），存入本地缓存。
3. 打开或刷新 OpenCanvas（本地默认 `http://localhost:3000`）。素材节点通过桥接协议读取缓存列表并拉取图片。
4. 点击扩展图标可查看缓存数量与最近条目，并可「清空缓存」。

## 部署到其它域名

内容脚本默认只注入 `http://localhost:3000/*` 与 `http://127.0.0.1:3000/*`。OpenCanvas 部署到其它 origin 后，把新地址追加到 `manifest.json` 的 `content_scripts.matches`：

```json
"matches": [
  "http://localhost:3000/*",
  "http://127.0.0.1:3000/*",
  "https://your-open-canvas.example.com/*"
]
```

保存后回到 `chrome://extensions`，点击扩展卡片上的刷新按钮，并刷新 OpenCanvas 页面。

## 缓存位置

- 数据保存在扩展自己的 IndexedDB：数据库 `opencanvas-cache`，对象仓库 `images`，主键 `id`。
- 每条记录形如 `{ id, name, mime, size, width, height, pageUrl, pageTitle, addedAt, blob }`，其中 `blob` 是图片原始字节。
- 缓存与当前网站无关，不会被网页清理操作删除；只有清空缓存或卸载扩展才会消失。`unlimitedStorage` 用于避免图片撑爆扩展配额。

## 页面桥接协议

content script 与页面通过 `window.postMessage` 通信，双向都使用 `window.location.origin` 作为 `targetOrigin`，并校验 `event.origin`、`event.source` 与 `source` 标记。

- 扩展 → 页面：`{ source: "opencanvas-browser-cache", type: "ready", version: 1 }`
- 页面 → 扩展：`{ source: "opencanvas-app", type: "request", requestId: string, action: "list" | "get" | "clear" | "hello", id?: string }`
- 扩展 → 页面：`{ source: "opencanvas-browser-cache", type: "response", requestId: string, ok: boolean, error?: string, data?: unknown }`

响应数据：

- `list` → `data = { items: [{ id, name, mime, size, width, height, addedAt }] }`，按加入时间倒序。
- `get` → `data = { id, name, mime, dataUrl }`，`dataUrl` 为 base64 `data:` URL。
- `clear` → `{ ok: true }`。
- `hello` → `{ ok: true, data: { version: 1 } }`，并重新广播一次 `ready`。

## 已知限制

- MV3 的 Service Worker 空闲会被回收，但 IndexedDB 数据会保留；每次被唤醒时会重新按记录数同步角标。
- `get` 返回的图片是 base64 `data:` URL：扩展消息经 JSON 序列化，Blob/ArrayBuffer 无法直接传递。大图会产生较大的 base64 字符串，内存与耗时随之增加。
- `host_permissions` 使用 `<all_urls>` 以覆盖任意网站的图片抓取，权限范围较宽，定位是个人 / 开发使用。
- 仅支持 `http(s):` 与 `data:` 图片来源；`file:`、`blob:` 等会被跳过。
- 需要登录或防盗链策略严格的图片可能抓取失败，失败原因会打印在扩展的 Service Worker 控制台中。
