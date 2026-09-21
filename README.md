<p align="center">
  <img src="web/public/logo.svg" width="96" alt="OpenCanvas logo">
</p>

<h1 align="center">OpenCanvas</h1>

<p align="center">面向图片与视频创作的开源画布工作台</p>

OpenCanvas 是一个纯前端的画布工作台，把画布编排、AI 图片 / 视频 / 音频 / 文本生成、参考图编辑和素材沉淀放在同一个界面里，适合用来探索视觉方案并连续迭代结果。

> 项目仍在开发中，本地存储格式可能随时调整，不保证历史数据兼容。二次开发与 PR 请保留原作者信息与前端页面标识。

## 核心功能

### 画布

- 多画布与库管理：新建 / 重命名 / 删除库与画布、跨库移动、左侧快速切换与拖拽排序。
- 节点拖拽与缩放、连线与关系标签、小地图、撤销重做、锁定 / 隐藏、对齐与等距分布、节点列表批量重命名。
- 顶部与左侧坐标标尺、16px 网格吸附、对齐参考线。
- 深色 / 浅色主题，点 / 线 / 空白三种画布背景。
- 整包导出 / 导入：把画布节点、连线、视图与全部图片 / 视频 / 音频资源打包成 ZIP，导入时新建画布、不覆盖已有数据。

### 节点（17 种内置）

- 内容节点：文本、图片、视频、音频。
- 提示词节点：提示词、音乐提示词、语音提示词、视频提示词。
- 生成节点：生成配置、图片生成、语音生成、音乐生成、视频生成。
- 画板节点：智能画布。
- 工具节点：资源、录音、图片修饰。

底部工具栏按「输入/输出、提示词、生成器、修饰」分组创建节点；提示词节点只负责提示词，通过连线接入生成节点。

### AI 生成

- 浏览器直连 OpenRouter（`https://openrouter.ai/api/v1`），API Key 存在本地，不经过任何项目服务器。
- 支持文本、图片（文生图与参考图编辑）、视频、语音、音乐。
- 图片：张数、分辨率（1K / 2K / 4K / 自动）、宽高比、质量、透明背景，保持原始比例。
- 视频：`minimax/hailuo-3-max`，480p / 768p、5–15 秒、六种宽高比；支持首尾帧与参考图（两者互斥），刷新页面后可继续轮询远端任务。
- 语音与音乐使用预设模型，输出 MP3。
- 生成结果直接排布在画布上，不会自动连线回生成节点；OpenRouter 返回用量时记录单次真实费用。

### 图片工具

- 裁剪、切图（本地 MobileSAM 点选分割）。
- 局部遮罩编辑：可只写入节点，也可立即生成。
- 分辨率：算法放大 / 算法缩小 / AI 提升。
- 抠图（本地背景移除模型，首次使用按需下载）。
- 图片分析：主色板、EXIF、感知哈希，并可按比例智能裁剪。
- 识别文字（OCR，走已配置的文本模型并生成文本节点）。
- 图片修饰节点：滤镜参数 + 色调参数（黑白场、gamma、曝光、高光、阴影）与可编辑色调曲线，可烘焙为新图片节点。
- 视频节点可截取首帧 / 尾帧 / 当前帧为图片节点。

### 智能画布

- 固定比例画板，可选 1K / 2K / 4K 合成分辨率，支持背景色与背景不透明度。
- 图片拖入即置入画板，仍是普通可编辑节点，随画板一起移动，画板渲染在其下层。
- 图层面板：前后顺序、显示 / 隐藏、16 种混合模式与不透明度。
- 画板内文字标注。
- 一键排版模板：网格 / 单行 / 单列 / 主图。
- 画板可嵌套，递归渲染与递归合成。
- 双击预览合成结果，或一键存为图片节点。

### 资源与浏览器扩展

- 「资源」节点绑定本地文件夹（File System Access API），以文件名列表展示图片 / 视频 / 音频 / 文本，点击或拖出即插入画布；每个资源节点各自绑定文件夹，绑定按节点保存在本地。
- 把图片节点拖到资源节点上，会把图片写入该节点绑定的文件夹。
- 可选浏览器扩展（`extension/`）：在任意网页右键图片「添加到 OpenCanvas 缓存」，资源节点可切换到「插件缓存」来源并直接拖入画布。

### 素材

- 「我的素材」为浏览器本地素材库（文本 / 图片 / 视频），支持标签、搜索与手动分组。

### 本地画布 MCP

- 前端服务在同一端口 3000 同时提供网页与 HTTP MCP：`http://127.0.0.1:3000/mcp`，共 32 个画布工具。
- 网页同源自动连接，不需要 token，也不需要配置文件。
- 可读取当前画布与选区、创建与编辑全部内置节点、连线、触发生成、整理智能画布与图层。
- 设置 → Agent 可逐类开关画布操作权限，并保留操作审计日志与回放。
- 没有内置聊天助手：由外部 MCP 客户端（例如 opencode）通过后台桥接驱动画布。

### 插件系统

- 通过 URL 安装 / 启用 / 更新 / 卸载远程节点插件，内置官方插件注册表。
- 提供 TypeScript SDK，可开发带面板、资源输入与可选 AI 生成的画布节点插件。

## 快速开始

```bash
git clone https://github.com/AntarcticBearHKL/OpenCanvas.git
cd OpenCanvas/web
bun install
bun run dev
```

运行后默认端口 3000，访问 `http://localhost:3000`。

## 配置

- 打开右上角设置 → 接口，填入 OpenRouter 的 API Key。
- API Key、画布项目、素材与生成记录都保存在浏览器本地，由前端直接请求 `https://openrouter.ai/api/v1`。

## 浏览器扩展（可选）

```
chrome://extensions → 打开「开发者模式」→「加载已解压的扩展程序」→ 选择本仓库的 extension/ 目录
```

安装后在任意网页右键图片即可加入缓存，随后在画布「资源」节点切换到「插件缓存」来源使用。详见 [`extension/README.md`](extension/README.md)。

## 文档

- [快速开始](docs/content/docs/overview/quick-start.mdx)
- [功能介绍](docs/content/docs/overview/features.mdx)
- [画布节点操作手册](docs/content/docs/canvas/canvas-node-manual.mdx)
- [画布快捷键](docs/content/docs/canvas/canvas-shortcuts.mdx)
- [本地画布 MCP 连接原理](docs/content/docs/development/local-canvas-mcp.mdx)
- [画布数据结构](docs/content/docs/development/canvas-data-structure.mdx)
- [待办事项](docs/content/docs/progress/todo.mdx) · [待测试](docs/content/docs/progress/pending-test.mdx)

## 社区支持

学 AI，上 L 站：[LinuxDO](https://linux.do/)

点击链接加入群聊【开源 OpenCanvas(2群)】：https://qm.qq.com/q/HRt2kUnYiG

## 开源协议

本项目使用 [MIT License](LICENSE)。
