# 浏览器扩展：WebContentsView → `<webview>` 迁移与评论编辑器 React 化

**日期**：2026-07-10
**范围**：`packages/extension-browser`、`packages/app/src/main/index.ts`
**背景**：对齐 ORCA（`stablyai/orca`）的 in-page annotation 实现，解决注入式评论编辑器可维护性差的问题。

---

## 为什么要做这次迁移

### 起因：注入式 editor 不可维护

`annotation-viewport-bridge.ts` 原本把评论编辑器作为一坨 ~330 行 JS 字符串注入 guest 页面（shadow DOM + 内联 CSS + 硬编码 SVG + 手写 `placeEditor` 碰撞逻辑）。后果：

- 无类型 / 无 lint / 无断点，单测只能 `expect(script).toContain("showEditor")`。
- 改一个按钮（如 DETAIL → 图标）要硬编码超长 SVG 字符串；改定位要手写 clamp 逻辑。
- 与 `element-selection.ts`（800 行注入脚本）各写各的，shadow-DOM overlay / 坐标计算零复用。

### 调研结论：ORCA 也是注入式，但 editor 在 React

调研 ORCA（`/Users/zhiyu/Desktop/github/orca`）后发现其 annotation 是**三种 overlay 混合架构**：

| 职责 | ORCA | 迁移前本项目 |
|---|---|---|
| Grab 高亮框 | 注入 guest 主世界 `executeJavaScript` | 同（`element-selection.ts`） |
| 持久化数字 marker | 注入 guest **隔离世界** | 注入主世界 |
| **评论编辑器** | **React overlay**（Radix Popover，锚到 live rect） | **注入 guest DOM**（偏离） |
| marker 跟随滚动 | 存 `rectPage`，scroll/resize + rAF | 同 |
| guest→host 通信 | `console.debug` 前缀+token + `console-message` | 同 |

**核心结论**：marker / picker / 通信机制两边一致，注入式字符串本身不是问题（ORCA 在同样约束下也这么干）。真正偏离的是**评论编辑器**——ORCA 放在 host renderer 用 React 画，本项目塞进了注入脚本。这就是可维护性差的根因，也是前两个 bug（按钮样式、定位）的来源。

### 撞上的架构岔路：WebContentsView vs `<webview>`

ORCA 的 React editor 能用 z-index 盖在页面上，是因为它用 **`<webview>`**（renderer DOM 的一部分）。本项目用 **`WebContentsView`**（`contentView.addChildView`，原生合成层，**React 永远盖不住**）。README 明说这是"有意偏离 ORCA"。

所以"对齐 ORCA 的 React editor"的底层前提是先把浏览器层从 `WebContentsView` 换回 `<webview>`。

---

## 关键决策与纠错

### 决策 1：迁移到 `<webview>`（推翻 WebContentsView）

**权衡**：
- `WebContentsView`：Electron 官方推荐，main 可控，但 React overlay 盖不住 → editor 可维护性被架构锁死。
- `<webview>`：Electron 标注"不推荐新项目使用"，但 ORCA 生产级长期使用；换来 React 能盖住 + 省掉 `setBounds`/zoom 坐标管理那套（减负）。

**能力核对**（迁移不丢什么）：
- 截图 / CDP / executeJS / navigation / 窗口策略：经 `webview.getWebContentsId()` + IPC `registerGuest` + main `webContents.fromId()` 操作（ORCA 的 `registerGuest` 模式）。
- profile 隔离：`<webview partition="...">` 属性。
- 坐标管理：`setBounds`/zoom 整套删除（`<webview>` 靠 CSS 排版）。

### 纠错：sandbox 不丢（之前误判）

调研中我曾错误判断"`<webview>` 默认非 sandbox，迁移会丢 `sandbox:true`"，并据此得出"必须 sandbox 就不迁移"。**这是错的**，查 Electron 39 type 定义（`electron.d.ts`）纠正：

- `WebPreferences.sandbox` **Electron 20+ 默认 `true`**（`electron.d.ts:18541`）。
- `<webview>` 的 `webpreferences` 属性串支持 `sandbox=true`（同 BrowserWindow 的 WebPreferences）。
- 还有全局开关 `app.enableSandbox()`（`electron.d.ts:1033`："all renderers will be launched sandboxed, regardless of the `sandbox` flag"）。
- ORCA 的 `<webview>` 没显式开 sandbox，正是靠这个默认值跑在 sandbox 里。

**落地保证**：main entry 调 `app.enableSandbox()`（ready 前）+ `<webview>` 显式 `webpreferences='sandbox=true,...'`。

### 决策 2：editor 用 React overlay，marker 脚本保持注入式

- marker pin + hover tooltip + scroll 跟随：保留注入式（对齐 ORCA，职责单一，~330 行 → ~120 行）。
- 评论编辑器：改 React 组件（`annotation-editor.tsx`），用 lucide 图标 + 纯函数 `computeEditorPosition` 做碰撞定位（可单测）。
- guest 与 host 分工：guest marker 点击只 emit `open` 事件（带 marker 几何），React editor 消费 `open` 弹出，save/delete 直接更新 renderer 的 annotation state（不再经 guest emit）。

---

## 实现要点

### main 侧所有权翻转（`browser-manager.ts`）

- 删除 `WebContentsView` / `attachedView` / `showSurface` / `detach` / `setSurface` / zoom 换算 / `createView`。
- `ManagedTab` 改为持 `state` + `contents: WebContents | null`（registerGuest 前 null）。
- 新增 `registerGuest({browserPageId, sessionId, profileId, webContentsId})`：校验拒绝主窗口自己的 webContentsId → `webContents.fromId()` → 挂导航/console/popup 监听。
- `detachGuest`：清理 listener（stash 在 `contents.__divisorGuestListeners`），guest 重建时先 detach 旧的。
- `requireContents(tab)`：contents 为 null 时抛 `browser_page_closed`（snapshot/screenshot/selection 都走它）。

### renderer 侧 `<webview>` 挂载（`renderer.tsx` + `browser-page-webview.ts`）

- `ensureBrowserPageWebview`：命令式 `document.createElement('webview')`（非 JSX，因 `<webview>` 无一流 TS 类型 + 生命周期更易命令式管理），设 partition/allowpopups/webpreferences，registry 复用。
- `dom-ready` → `getWebContentsId()` → IPC `registerGuest`。
- 主窗口 `webPreferences` 加 `webviewTag: true`。

### editor React 化（`annotation-editor.tsx` + `annotation-editor-position.ts`）

- 纯定位函数 `computeEditorPosition` 抽到独立模块（无 React 依赖，可单测）：marker 居中 + 视口 clamp + 下方溢出翻上方。
- `open` 事件 payload 扩展带 `rectPage`/`rectViewport`/`isFixed`/`comment`/`intent`/`tagName`/`computedStyles`（`BrowserAnnotationViewportBridgeOpenPayload`）。
- anchor 坐标 = `<webview>` 元素 `getBoundingClientRect()` + marker 的 `rectViewport`。

---

## 踩过的坑（迁移后三个回归 bug）

### 坑 1：界面一直刷新（渲染循环）

**现象**：打开浏览器、在地址栏输入时，页面不停刷新。

**根因**：webview 挂载 effect 的依赖里放了 `activeTab` 对象（及 `state.profiles`、`selectingTabId`）。main 在 guest 加载时高频 emit `stateChanged`（loading/title/url 串发），每次都给 renderer 一个**全新 state 对象** → `activeTab = state.tabs.find(...)` 每次新引用 → effect 重跑 → cleanup `removeChild(webview)` + 重挂 `<webview>` → **guest 重新加载** → 又触发 loading 事件 → 死循环。

**修复**：effect 依赖改为**稳定标识** `activeTabId`（string）+ `partitionForActiveTab`（string，值相等不重跑）+ `panel` + `sessionId`；effect 内用 `stateRef.current` 读最新 tab。url 变化拆独立 effect（`webview.src !== url` 才赋值，不重挂）。恢复了迁移前 `setSurface` effect 用 `activeTab?.id` 作依赖的稳定行为——迁移时我误把依赖换成了整个 `activeTab` 对象。

### 坑 2：选元素流程卡住

**现象**：点工具栏评论按钮选元素，流程卡死。

**根因**：我迁移时加的 `webview.style.pointerEvents = selectingTabId ? "none" : "auto"` 在选元素时把 `<webview>` 锁成 `pointer-events:none`，guest 收不到鼠标点击，注入的 selection picker 永远等不到点击。

**修复**：删掉 inputLocked effect；挂载时 `inputLocked: false`（guest 始终接收输入）。selection picker 在 guest 内部自己处理点击，GrabConfirmationSheet 在 viewport 区域下方不与 webview 重叠，无需锁。

### 坑 3：打开一个网页开多个重复 tab

**现象**：打开网页出现 3 个 tab，且持久化跨重启累积。

**根因（两个叠加）**：
1. `browser/open` 工具每次都 `createTab`，即使该 url 已有 tab。agent 重复调同 url → 累积重复。
2. 持久化文件已积累历史重复 tab（某 session 有 2 个完全相同的 rrweb tab，另一 session 有 4 个）。

**修复**：
- `browser-manager.ts` 新增 `openOrFocus(sessionId, url, profileId)`：同 url tab 已存在则激活复用，否则才 `createTab`。`browser/open` 改用它。
- `load()` 按 `(sessionId, url)` 去重恢复，清理历史重复 + 失效的 `activeTabBySession` 指针。

---

## 验证

- extension-browser 测试 19/19 通过（原 14 + 新增 5 个 `computeEditorPosition` 碰撞单测）。
- `typecheck:node` / `typecheck:web` 绿（唯一错误是 master 预存的 `VoiceInputButton` props，与本次无关）。
- `oxfmt` + `oxlint` 对全部改动文件干净。
- 人工实测：地址栏输入不再刷新、选元素流程通畅、重复 tab 已去重。

---

## 后续可改进

- marker 跟随滚动用了快照时刻 `rectViewport`，打开 editor 后若页面滚动 editor 不会实时跟随。可打开 `emitViewport` 通道让 editor 锚到 live rect（对齐 ORCA 的 `getLiveBrowserAnnotationRect`）。
- marker 注入仍跑在主世界，可改 `executeJavaScriptInIsolatedWorld`（对齐 ORCA，防页面 monkey-patch 读到 token / 伪造 save/delete 事件）。
- `element-selection.ts`（800 行注入脚本）仍是注入式，可同样抽模块化 + co-located 测试。
