# Browser Artifact · 2026-06-25

## Why

之前的 artifact 面板只能承载纯文本 / 富文本 / side-chat 三种产物。当 agent 启了一个本地 dev server，或需要用户对某个公开页面给反馈时，用户只能把 URL 复制到外部浏览器，描述、定位、引用文本都靠纯文字——反馈链条长、定位精度差、URL 上下文容易丢失。

`browser-artifact` 把"页面"本身变成一个一等 artifact：

- agent 通过 `browser/open` 工具产出 `type: "browser"` artifact，载荷只有 `{ title, url }`；
- 渲染端在面板内原生托管该 URL，提供后退 / 前进 / 刷新 / 外部打开 / 状态指示；
- 用户可以进入"批注模式"：冻结当前帧（截图 + DOM 标注），选取页面上的目标元素，再把"目标元素 + 用户批注 + URL"作为一条 user prompt 回到对话里，agent 据此改实现。

这样 artifact 从"展示产物"升级为"对话回路中的可交互对象"，且把"我想改这个按钮"和"我想改第 87 行代码"统一成同一种交互。

## How

### 1. 新增 artifact 类型 — `type: "browser"`

载荷：

```ts
interface BrowserArtifactContent {
  title?: string;
  url: string;
}
```

注册位置：

- 主进程 `tools/browser-tool.ts` 注册 `browser/open`（risk_level=`safe`），执行后返回 `details.artifacts` 数组，触发既有的 `upsertArtifactsFromToolDetails` 链路；
- `tools/index.ts` 导出 `browserOpenTool`，`agent-runtime.ts` 把它和 `fsRead*` / `terminalCreate` 并入 `builtinTools`；
- `use-agent-messages.ts` 在 upsert 时，对 `type === "browser"` 额外调用 `extensionsApi.openArtifact(sessionId, artifact.id)`，确保 artifact 被自动选中并渲染；
- `artifacts/index.tsx` 的 `ArtifactContent` 增加 `if (artifact.type === "browser")` 分支，并新增 `Globe2` 图标。

### 2. 原生托管 — `WebContentsView` 嵌入主窗口

每个 browser artifact 在主进程对应一个 `WebContentsView`，挂到主 `BrowserWindow.contentView` 下：

```
BrowserWindow (app 自身)
└── contentView
    ├── React renderer (electron-vite 渲染层)
    └── WebContentsView #1  ── artifact A（stage A 位置）
    └── WebContentsView #2  ── artifact B（stage B 位置，未激活时 0×0 折叠）
```

关键决策点（**为什么不新开 `BrowserWindow` / 为什么不用 `<webview>`**）：

- `BrowserWindow` 是顶级窗口，会脱离主窗口的 devtools / 快捷键 / 输入框焦点，跟 artifact 面板的"嵌入式"语义不符；
- `<webview>` 标签在 Electron 39 已被标记为 legacy，且 process 模型独立，需要额外的 IPC 桥接；
- `WebContentsView` 共享主窗口的渲染进程，可以用 `webContents` 直接调 `capturePage` / `executeJavaScript` —— 这正是 annotation 截图 + DOM 标注的核心。

安全基线（`browser-manager.ts:42-48`）：

```ts
new WebContentsView({
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  },
});
```

加上 `setWindowOpenHandler(() => ({ action: "deny" }))`（拒弹窗）、`will-navigate` 拦截非白名单协议（仅允许 `about` / `file` / `http` / `https`）→ 状态置 `"blocked"`。

### 3. 坐标同步 — renderer → main 的 anchored bounds

artifact 容器 (`<div ref={stageRef}>`) 的 `getBoundingClientRect()` 既是渲染端"舞台"的尺寸，也是主进程 `WebContentsView` 在主窗口中的 bounds：

```ts
// renderer (BrowserArtifact)
useLayoutEffect(() => {
  const updateBounds = () => {
    const rect = stage.getBoundingClientRect();
    void invoke("browserSetBounds", sessionId, artifactId, {
      height: rect.height, width: rect.width, x: rect.left, y: rect.top,
    });
  };
  updateBounds();
  const ro = new ResizeObserver(updateBounds);
  ro.observe(stage);
  window.addEventListener("resize", updateBounds);
  return () => { ro.disconnect(); window.removeEventListener("resize", updateBounds); };
}, [...]);
```

主进程 `applyBounds`：

```ts
const hasArea = record.bounds.width > 0 && record.bounds.height > 0;
record.view.setBounds(
  record.visible && hasArea ? record.bounds : { height: 0, width: 0, x: 0, y: 0 },
);
```

非浏览模式（`mode !== "browse"`，即批注中）会把 bounds 折叠成 `0×0`，让 `WebContentsView` 暂离屏幕，截图层接管显示。这是"冻结当前帧"的基础。

### 4. Annotation — 截图 + DOM targets 二合一捕获

`browserCaptureForAnnotation` 一步完成两件事：

```ts
async captureForAnnotation(sessionId, artifactId) {
  const image = await record.view.webContents.capturePage();
  const targets = await record.view.webContents.executeJavaScript(
    `(${collectAnnotationTargets.toString()})()`,
    true,
  );
  return { dataUrl: image.toDataURL(), targets: Array.isArray(targets) ? targets : [] };
}
```

`collectAnnotationTargets`（同文件 `browser-manager.ts:252-291`）在页面内执行，对 `button / a / input / textarea / select / [role=button] / h1-h3 / nav / section / table / [data-testid]` 做一次扫描，过滤规则：

- `getBoundingClientRect` 长宽 < 8px 跳过；
- 完全在视口外跳过（`rect.right < 0` 等）；
- 截断文本到 80 字；
- 限制最多 24 个 target。

返回结构是 viewport 内的 `{ kind, label, rect, text }`，**不暴露 CSS selector**（避免 prompt 注入面），只暴露 `[data-browser-target="${index}"]` 这种 placeholder。

### 5. 三态模式 — browse / selecting / commenting

`BrowserArtifact` 内部维护 `mode`：

| Mode       | WebContentsView | 截图叠加层 | 作用 |
| ---------- | --------------- | ---------- | ---- |
| browse     | 可见（stage bounds） | 否     | 正常使用页面 |
| selecting  | 0×0 折叠        | 是（每个 target 一个 clickable button） | 用户挑选目标元素 |
| commenting | 0×0 折叠        | 是（选中的 target + 编号 + composer） | 用户输入批注 |

UI 是 `docs/原型/browser-artifact-prototype.html` 的实现版本：composer 是浮在截图下方的胶囊，支持"折叠 / 展开"两种状态，展开时显示目标元素的样式属性（颜色、字号、字重等）—— 这些都是占位 readOnly，等后续真正支持"修改样式"再接入。

### 6. Annotation → Prompt

提交批注时：

```ts
const prompt = buildAnnotationPrompt(browserState.url, selectedTarget, comment);
// "请根据浏览器 artifact 中的页面批注修改当前实现。\n\nURL: ...\n目标元素: button\n元素文本: 提交\n元素位置: x=..., y=..., width=..., height=...\n\n批注意见:\n改大一点颜色调成蓝色"
const appUserMessage: AppUserMessage = { role: "user", content: prompt, ..., metadata: { model: ... } };
mainStore.getState().setStatus(sessionId, "running");
await invoke("prompt", sessionId, appUserMessage);
```

注意：批注提示里**不带** `selector` / `data-browser-target`，只给 `kind / text / rect` —— 让模型自己用 dev tools 或文本匹配定位真实 DOM，避免把 placeholder 误当成真选择器。

### 7. IPC 错误契约

所有 browser IPC handler 把异常包成 `{ error: string }` 而不是 throw：

```ts
typedIpcMain.handle("browserCreate", async (...args) => {
  try { return await browserManager.create(...args); }
  catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
});
```

渲染端用 `"error" in result` 做 type narrowing（见 `BrowserArtifact.tsx:70`、`110-119`）。`destroySession` / `setBounds` / `setVisible` 不需要返回业务结果所以不包 try/catch，但仍然要求 BrowserManager `requireRecord` 在缺失时 throw。

### 8. 生命周期 — 跟 session 一起销毁

`agent-ipc.ts` 把 `destroySession` 改造成先关浏览器再清 session：

```ts
typedIpcMain.handle("destroySession", async (sessionId) => {
  await browserManager.destroySession(sessionId);
  await agentPool.destroySession(sessionId);
});
```

`BrowserManager.destroySession(sessionId)` 会遍历 `records` 把属于该 session 的 view 全部 `removeChildView` + `webContents.close()`，避免 WebContents 泄漏。

### 9. 顺带修复 — side-chat 的 `model` 字段

`App.tsx` 在写入 `sideChat.appendSideChatMeta` 时把 `input.model`（结构 `{ modelId, providerId }`）映射成 `{ modelId, modelName, providerId, providerName }`：

```ts
model: input.model
  ? {
      modelId: input.model.modelId,
      modelName: input.model.modelId,    // 当前没有独立 displayName，先回退到 ID
      providerId: input.model.providerId,
      providerName: input.model.providerId,
    }
  : undefined,
```

这是因为 `BrowserArtifact.submitAnnotation` 会读取 `activeSession?.model` 拼出 user prompt 的 `metadata.model`，而 side-chat 的 session 里只存了 raw model ID pair。`modelName` / `providerName` 暂用 ID 占位，等 server 端接入真正的 provider / model catalog 再回填。

## 风险与后续

- **单一 WebContentsView 在主窗口中叠加**：当用户切走 artifact 面板但保留会话时，view 折叠成 `0×0`，但 `webContents` 仍在跑 JS / 网络。建议在 `setVisible(false)` 时调 `webContents.setBackgroundThrottling(true)` 节能，或在 `BrowserManager` 加 idle timer 真正 detach。
- **annotation 截图是 PNG dataUrl**：当页面长截图（>4K）时 `dataUrl` 会非常大，目前直接塞回 IPC 响应；后续考虑改 binary transfer（`ipcRenderer.send` + `MessagePort` / `postMessage`）。
- **`will-navigate` 拦截白名单**：当前只放行 4 个协议；如果未来要支持 `chrome-extension://` 或自定义 scheme，需要扩展 `isAllowedUrl`。
- **批注 composer 的"样式属性"是占位**：`BrowserArtifact.tsx:418-438` 的字体 / 颜色 / opacity 都是写死 readOnly，等"按样式改"的工作流接通后再接 inspector。
- **prototype HTML 同步进仓库**：`docs/原型/browser-artifact-prototype.html`（55KB）作为设计参考存档，未来修改面板布局时直接对照；它和实现版是 1:1 对应关系，是有意保留而非临时文件。
