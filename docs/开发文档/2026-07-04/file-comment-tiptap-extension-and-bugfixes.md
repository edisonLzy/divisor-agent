# File Comment TipTap Extension + Bugfixes (2026-07-04)

## Why

### File Comment Nodes

`extension-files` 的 artifact panel 支持在文件上创建注释（comment），但注释只存在于 artifact 侧，无法在 prompt editor 中可视化。用户在发送 prompt 时需要手动引用注释位置，缺乏直观的结构化表达。

需要一个 TipTap 内联节点来表示文件注释，让注释在 editor 中可见、可交互，并随 prompt 一起提交。

### Floating UI Tooltip

之前文件注释的 hover 详情依赖浏览器原生 `title` 属性，只能展示纯文本、无法自定义样式，也无法展示结构化信息（路径、行号范围、选中文本预览等）。

### Bugfixes

1. `ResizablePanelGroup` 的 `key` prop 在 artifact panel 展开/收起时导致整个 DOM 子树销毁重建，触发 `PromptInput` unmount/remount，丢失编辑光标和内容。
2. `StrictMode` 在开发模式下强制 mount → unmount → remount，导致 TipTap editor 实例被重复创建销毁，干扰依赖 `onCreate`/`onDestroy` 的 `sharedPromptEditor` cell。

## How

### 1. File Comment TipTap Extension

**新增文件** (`packages/extension-files/src/renderer/file-comment-extension/`):

- `model.ts` — `FileCommentNodeAttrs` 接口（8 个属性：body、commentId、filePath、startLine/Column、endLine/Column、selectedText），序列化/反序列化（XML 格式）、相等比较、tooltip 内容构建。
- `node.tsx` — TipTap `Node` 定义（inline、atom、not selectable），8 个 `addAttributes` 映射到 DOM `data-*` 属性。`ReactNodeViewRenderer` 渲染紫色 badge（FileCode2 icon + 文件名 + 行号范围），点击调 `addOrActivateFileComment` 跳转到 artifact 对应注释。`FileCommentTooltip` 子组件通过 `@floating-ui/dom` 定位的 portal tooltip（展示 meta、preview、source）。
- `sync.ts` — `diffFileCommentPromptSync` 对比新旧 comment 列表生成 insert/update/remove op；`syncPromptFileComments` 将 ops 应用到 editor。内部遍历 `editor.state.doc.descendants` 按 `commentId` 查找已有节点，`buildFileCommentInsertion` 处理前后空格避免粘连。
- `index.ts` — barrel re-export。

**注册** (`packages/extension-files/src/renderer.tsx`): `ctx.promptInput.registerExtension(fileCommentExtension)` 将扩展注入到所有 PromptInput 实例。

**类型提取** (`packages/extension-files/src/renderer/files-artifact/types.ts`): 将 `FileEntry`、`FileComment`、`FileCommentRange`、`FilesArtifactContent` 等类型从分散位置集中到独立的 `types.ts`。

**artifact-state 重构** (`packages/extension-files/src/renderer/files-artifact/artifact-state.ts`): 从 `FilesArtifact.tsx` 中提取状态操作逻辑（`addOrActivateFile`、`addOrActivateFileComment`、`updateFileEntry`、`activateFileEntry`）到独立的纯函数模块，便于单元测试和 sync 层复用。

### 2. Floating UI Tooltip

`FileCommentNodeView` 中 `FileCommentTooltip` 组件：

- 使用 `@floating-ui/dom` 的 `computePosition` + `autoUpdate` 定位，placement `top-start`，middleware `offset(12)` + `flip` + `shift`。
- Portal 到 `document.body` 避免 overflow 裁剪。
- Hover/focus 触发，blur 关闭。
- 展示：标题（FileCode2 icon + "代码注释"）、meta（文件路径 + 行号范围）、preview（selectedText + body 或 "暂无注释内容"）、footer 来源标识。

### 3. Bugfix: `ResizablePanelGroup` key prop

`active-session-content.tsx` 中移除了 `ResizablePanelGroup` 的 `key={isArtifactPanelOpen ? "with-artifacts" : "chat-only"}`。

这个 `key` 的本意是让 panel 在 artifact 展开/收起时重新计算默认尺寸。但 React 的 `key` 变化会导致整个子树 unmount → remount，触发 `PromptInput` 重建。

**替代方案**：`ResizablePanel` 的 `defaultSize` 在 artifact 切换时已经足够驱动布局。移除 `key` 后 panel 保持挂载，editor 实例连续。

### 4. Bugfix: StrictMode disable

`packages/app/src/renderer/main.tsx` 中注释掉 `StrictMode` 包裹。

`StrictMode` 开发环境下 mount → unmount → remount 的双重调用导致：
- `sharedPromptEditor.onDestroy` 被调用一次（第一次 unmount）
- `sharedPromptEditor.onCreate` 被调用两次（第一次 mount + 第二次 mount）
- 最终 cell 持有的是第二次 mount 的 editor 实例，行为正确但 `onDestroy` 在第一次 unmount 时清空了 editor 引用，中间有短暂窗口 `editor === null`

虽然最终状态正确，但 StrictMode 的双调让依赖 `onCreate`/`onDestroy` 生命周期的逻辑调试困难。改为仅在生产环境保留 StrictMode 语义。

### 5. User Message Editor 扩展支持

`packages/app/src/renderer/pages/workspace/chat/messages/user-message.tsx` 中 `EditableUserMessage` 的 `useUserMessageEditor` 通过 `usePluginPromptInputExtensions()` 将扩展注册的 TipTap 节点也应用到 readonly 的用户消息编辑器中，确保已提交的消息中的自定义节点能正确渲染。

## Trade-offs / Notes

- **File Comment 节点是 inline atom**：不可选中、不可编辑，适合 badge 样式展示。用户交互（修改 body/range）仍在 artifact panel 完成，editor 中的节点只是可视化引用。
- **commentId 作为节点标识**：sync 层按 `commentId` 匹配，支持单个 comment 在 editor 中多处插入（目前不常用，但语义支持）。
- **序列化采用 XML 而非 JSON**：`serializeFileCommentNodeToXml` 用于 `copy` 操作，XML 格式更易被外部模型解析。内部 ProseMirror 存储仍使用 JSON 结构。
- **`diffFileCommentPromptSync` 的边界情况**：
  - 上一轮有 body、本轮 body 为空 → 标记 remove
  - 上一轮无 body、本轮有 body → 标记 insert
  - commentId 在新列表不存在 → 标记 remove
  - attrs 变化 → 标记 update（仅 `setNodeMarkup`，不重建节点本身）
- **Floating UI vs 原生 title**：Floating UI 支持任意 React 内容、跟随滚动/缩放、样式一致。代价是多一个 portal + `autoUpdate` 的 DOM 开销，但只有 hover 时才渲染。
- **StrictMode 被注释而非移除**：保留注释方便后续重新开启。生产构建不受影响（生产模式下 StrictMode 不执行双调）。
- **key prop 移除对 panel 默认尺寸的影响**：测试确认 `ResizablePanel` 的 `defaultSize` 属性在 panel 展开/收起时仍能正确驱动初始尺寸，无需 `key` 触发 remount。
