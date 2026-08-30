# 阅读批注系统取代抓取式评论（Reading annotations replacing grab-mode comments）

- 日期：2026-07-12
- 涉及包：`packages/extension-browser`
- 分支：`codex/browser-extension-webcontentsview`

## Why（为什么做这个改动）

之前的浏览器扩展用的是「抓取式评论（grab-mode comment）」模型：用户点击工具栏的抓取按钮，主进程向页面注入一个元素选择器（picker），用户点选一个 DOM 元素，guest 抽取该元素的完整可访问性树、计算样式、截图等上下文，回传给主进程生成一条 `BrowserPageAnnotation`。

这套模型有几个结构性问题：

1. **侵入性强、上下文过重**：一次选择要抽取 ~16 项计算样式、可访问性元数据、截图像素数据，payload 体积大且和具体 DOM 强耦合。
2. **与「阅读」场景错配**：这是一个 read-only 浏览器扩展，核心价值是「读网页并在文字上做批注」，而不是「截取某个 UI 元素去改它」。grab 模型偏向 "fix/change/question/approve" 的 UI 审查语义，和阅读批注无关。
3. **无本地持久化、无跨设备**：评论仅存在于当前会话内存里，关掉就没了；也没有与任何后端同步的机制。
4. **选择链路依赖主进程注入脚本**：`startElementSelection` / `cancelElementSelection` 需要在 guest 里注入/撤销 picker，逻辑分散在 `element-selection.ts` 和 `browser-manager.ts`，且和 `<webview>` 的渲染周期耦合。

新的「阅读批注（reading annotation）」模型把这些全部换成基于**原生文本选区（native text selection）**的轻量批注：用户在页面里直接选中文字，页面内的 preload 桥观察选区、序列化文本范围（XPath + 偏移），把选区连同句子上下文回传给 React 浮动工具栏。批注按归一化 URL 本地持久化，并可选择性地镜像到已有的 NoteBeam 服务。

## How（怎么实现的）

### 类型契约重写（`src/common/types.ts`）

删除了 `BrowserGrabPayload` / `BrowserGrabPageContext` / `BrowserGrabTarget` / `BrowserPageAnnotation` / `GRAB_BUDGET` 等一整套抓取类型，替换为与 NoteBeam `/v1/note-beam/*` API 对齐的契约：

- `BrowserReadingAnnotation` —— 一条批注，含 `id` / `url` / `text` / `sentence` / `range`（文本范围）/ `tag` / `note` / 时间戳。
- `BrowserTextRange` —— `{ start, startOffset, end, endOffset }`，用 XPath 定位，和 NoteBeam 的 range API 兼容。
- `BrowserReadingTag` —— `{ id, name, color, group, displayLabel }`，`group` 仅 `"english" | "general"`。
- `BrowserReadingNote` —— `{ id, content, createdAt, updatedAt }`。

### 主进程：本地优先 + 可选云同步（`src/main/`）

- `reading-annotation-store.ts` —— `ReadingAnnotationStore` 本地优先持久化层。用 `atomic rename` 写入 `userData/browser-reading-annotations.json`；任何单条记录的写入失败都被吞掉，保证页面阅读不会因持久化出错而失败。`normalizeAnnotation` / `normalizeTag` 在边界处强制约束长度和必填字段。
- `note-beam-sync.ts` —— `NoteBeamSync` 可选云镜像。`enabled` 当且仅当主进程环境同时设置了 `NOTE_BEAM_API_BASE_URL` 和 `NOTE_BEAM_ACCESS_TOKEN`；否则 `create/update/delete` 直接短路返回，**不会有任何用户数据出网**。`resolveTagId` 先查已有 tag，没有就创建。
- `main.ts` —— 删掉 `startElementSelection` / `cancelElementSelection` 两个 IPC，新增 `createReadingAnnotation` / `deleteReadingAnnotation` / `listReadingAnnotations` / `updateReadingAnnotation`，全部委托给 `ReadingAnnotationStore`（store 内部再 fire-and-forget 触发 `NoteBeamSync`）。

### 预加载桥：从「注入 picker」到「观察原生选区」（`src/preload/browser-annotation-bridge.js`）

完全重写。不再向页面注入选择器，而是：

- 监听 `selectionchange`，节流后序列化当前 `Range` 为 XPath + 偏移，连同 `rectViewport`、`sentence`、归一化 URL/标题，通过 `sendToHost` 发到 `__divisor-reading-annotation__` 通道。
- 在页面里渲染/恢复高亮 `<span data-divisor-reading-annotation>`，支持按 tag 过滤、按 `⌘/Ctrl+Shift+H` 开关高亮模式、按 `Alt+↑/↓` 在可见批注间导航。
- 通过 `__divisor-reading-annotation-command__` 通道接收来自 React 工具栏的命令（开关、筛选、跳转）。

### 渲染进程：浮动工具栏 + 编辑器（`src/renderer/`）

删除 `annotation-*` / `browser-comment` / `use-grab-mode` 等组件，新增：

- `browser-reading-annotation.tsx` —— TipTap 扩展，把选区作为批注节点插入 prompt。
- `reading-annotation-toolbar.tsx` —— 页面本地浮动工具栏，给选区分类（词汇 / 好句 / 要点 / 想法 / 疑问），加 Markdown 笔记或送入 AI prompt。
- `reading-annotation-editor.tsx` —— 笔记编辑器（用新引入的 `streamdown` 渲染 Markdown 笔记）。
- `reading-annotation-command.tsx` —— 右下角持久动作面板（高亮模式、导航、tag 过滤）。

`renderer.tsx` 里新增 `streamdown.registerComponents`，把助手消息里的 HTTP(S) 链接改写为在浏览器 Artifact 中打开的 `BrowserMessageLink`；`getState` 加载后调用 `ensurePage` 而非 `createTab`。

### 依赖

`packages/extension-browser/package.json` 新增 `streamdown`（catalog:），用于渲染批注笔记的 Markdown。`pnpm-lock.yaml` 同步更新。

## 设计取舍

- **本地优先，云是可选镜像**：选择本地 JSON + 可选 NoteBeam 同步，而不是默认上云。无凭据时零网络流量，符合 read-only 隐私预期；NoteBeam 兼容让已有服务能直接复用。
- **原生选区而非注入 picker**：去掉主进程注入脚本的复杂度，批注对象从「胖 DOM 快照」变成「瘦文本范围」，跨页面刷新可恢复、可序列化、可与后端对齐。
- **保留 WebContentsView → `<webview>` 架构**：本次没有回退到 Orca 风格的 `<webview>` 之外，只是把选区交互从「主进程驱动」变成「preload 观察 + React 渲染」，guest 始终是 renderer-owned `<webview>`。

## 相关文件

- `packages/extension-browser/README.md` —— 更新了阅读批注的能力说明与快捷键、NoteBeam 配置说明。
- 删除：`src/main/element-selection.ts`、`src/renderer/{annotation-composer,annotation-editor,annotation-tooltip,annotation-viewport-markers,browser-comment}.tsx`、`src/renderer/use-grab-mode.ts` 及对应测试。
- 新增测试：`__tests__/{browser-reading-annotation,note-beam-sync,reading-annotation-store}.test.ts`。
