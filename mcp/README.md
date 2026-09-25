# canvas-mcp

OpenCanvas 独立 MCP 服务 + 浏览器桥接。它把网页画布暴露给任意 MCP 客户端（opencode、Claude 等），
同时保留浏览器侧的 `AgentRuntime` 桥接协议：前端静态部署在 Cloudflare 上，MCP 与桥接在本机回环地址运行。

这是 `web/server/**` 内嵌 TypeScript 服务的等价 Python 端口，对外提供完全相同的 29 个工具、端点与协议版本（7）。

通用工具（`app_get_state` / `app_describe_actions` / `app_apply_ops`）通过页面注册的动作命名空间驱动任意页面，当前有 `canvas`、`image`、`audio`、`config` 四个命名空间。其中 `config` 默认标记为 `danger` 且默认拒绝，需显式开启后才可用；其快照始终把密钥脱敏为 `{ hasKey, last4 }`，写入密钥与读取原始密钥需分别授权。

## 运行

```bash
cd infinite-canvas/mcp
uv run canvas-mcp
```

默认绑定 `127.0.0.1:3210`。启动时会打印监听地址；若未设置 `CANVAS_MCP_TOKEN`，会随机生成一个并打印，
需要把它填入前端「设置」页。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CANVAS_MCP_HOST` | `127.0.0.1` | 监听地址。只允许回环地址，勿改成 `0.0.0.0`。 |
| `CANVAS_MCP_PORT` | `3210` | 监听端口。 |
| `CANVAS_MCP_ORIGINS` | 空 | 允许的浏览器 Origin 白名单，逗号分隔，精确匹配，例如 `https://foo.pages.dev,https://canvas.example.com`。 |
| `CANVAS_MCP_TOKEN` | 随机生成 | 访问令牌。未设置时启动随机生成并打印。 |
| `CANVAS_MCP_DEBUG` | 关 | 设为 `1`/`true`/`yes`/`on` 时输出调试日志。 |

## 端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST/GET/DELETE` | `/mcp` | MCP Streamable HTTP，暴露 29 个工具。 |
| `GET` | `/health` | `{ok, protocolVersion, hasPage, page, clients}`。 |
| `GET` | `/config` | `{ok, protocolVersion, url, hasToken}`。 |
| `GET` | `/events` | SSE 浏览器桥接：连接后发 `hello`，每 15s 发 `ping`，并转发 `tool_call`。 |
| `POST` | `/canvas/state` | 浏览器上报画布快照。 |
| `POST` | `/canvas/activate` | 浏览器声明自身为当前工具目标。 |
| `POST` | `/canvas/result` | 浏览器回传工具调用结果。 |

`/events`、`/canvas/*`、`/mcp` 需要令牌；令牌可放在 `Authorization: Bearer <token>` 头，也可放在 `?token=` 查询参数
（浏览器 `EventSource` 无法设置请求头，因此查询参数形式是必需的）。

## 安全模型

- **只绑定回环地址**：服务仅监听 `127.0.0.1`，不对外网开放。
- **Origin 白名单**：浏览器请求带 `Origin` 时，只有精确命中 `CANVAS_MCP_ORIGINS` 才放行并回显 CORS 头；
  未命中直接 `403`。无 `Origin` 的非浏览器 MCP 客户端不受影响。同时放行预检请求（`OPTIONS` → `204`），
  并返回 `Access-Control-Allow-Private-Network: true` 以支持 Chrome 的本地网络访问。
- **令牌鉴权**：所有桥接与 MCP 请求都要携带令牌，使用 `hmac.compare_digest` 常量时间比较，避免本机其它进程驱动画布。
- **令牌存放**：令牌只粘贴进已部署前端的「设置」页并保存在浏览器 `localStorage`，不写入构建产物，也不打进 bundle。

## 浏览器行为

- 从 HTTPS 页面访问 `http://127.0.0.1:3210` 在 Chrome / Firefox 可用；Safari 会拦截。
- Chrome 首次访问会弹出「本地网络访问（Local Network Access）」授权提示，需允许。
- 前端需要把桥接地址指向 `http://127.0.0.1:3210`，并在 `EventSource` 与 `fetch` 请求上带上令牌。

## opencode 配置

```jsonc
"canvas": {
  "type": "remote",
  "url": "http://127.0.0.1:3210/mcp",
  "oauth": false,
  "headers": { "Authorization": "Bearer <CANVAS_MCP_TOKEN>" }
}
```
