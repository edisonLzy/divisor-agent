# 阅读批注设计原型与 Design QA（Reading-annotation visual prototype & design QA）

- 日期：2026-07-12
- 涉及文件：`design-qa.md`、`docs/design/browser-reading-annotations.html`
- 关联实现：`packages/extension-browser`（见 `reading-annotations-notbeam-2026-07-12.md`）

## Why（为什么有这些文件）

阅读批注功能（`reading-annotations-notbeam-2026-07-12.md`）在动手前先有一版**视觉原型**与**设计 QA**，用来在写实现之前对齐交互与样式，并留下「已验证 / 未验证」的书面证据：

- `docs/design/browser-reading-annotations.html` —— 单文件 HTML 原型，承载桌面端 Browser Artifact 的批注交互与既有设计 token（`signal-*` 硬编码边框/阴影、系统 UI 字体、serif 正文）。它是「视觉真相（visual truth）」来源，实现层（`reading-annotation-*.tsx`）需要对齐它。
- `design-qa.md` —— 对原型做 Design QA 的结论。静态校验通过（脚本可被 Node 解析、`git diff --check` 无问题、源码里已无 `本页标注` 区块和浏览器 Tab 上的批注控件），但**浏览器渲染态的视觉 QA 被阻塞**：本应用的 Browser URL 策略在发现已存在的 tab 后拒绝访问本地 `file:` 原型，因而无法截图或比对布局/排版/溢出/交互态。

把它们一并提交，是为了把「设计意图 + 验证证据」和「代码实现」放在同一个历史里，避免原型/QA 散落在本地、后人无法追溯当时对齐了什么、以及还有哪条 QA 没闭环。

## How（原型与 QA 覆盖了什么）

实现对照原型做了如下取舍（来自 `design-qa.md` 的 checklist）：

- [x] 删除 `本页标注` 区块（页面级批注面板）。
- [x] 移除浏览器 Tab / 导航区域的批注控件与计数。
- [x] 批注的创建与编辑保留为**页面本地浮动交互**（对应 `reading-annotation-toolbar.tsx` / `reading-annotation-editor.tsx`）。
- [x] 全局管理收进 command palette（对应 `reading-annotation-command.tsx`），而非常驻面板。
- [ ] **待办**：本地 `file:` 访问被放行后，补做浏览器渲染态视觉 QA，比对 desktop 默认态与 selection/note-popover 态。

## 已知缺口（需要后续闭环）

- 浏览器渲染态视觉 QA 仍然 **blocked**：在能打开本地预览的环境里重跑视觉比对，确认布局节奏、排版、溢出和交互态与原型一致。这条是当前唯一的未闭环项。

## 相关文件

- 原型：`docs/design/browser-reading-annotations.html`
- QA 结论：`design-qa.md`
- 实现 + 实现层 dev doc：`reading-annotations-notbeam-2026-07-12.md`
