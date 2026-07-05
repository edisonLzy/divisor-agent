# Deep Research 交互稿设计说明

> 状态：Deep Research 功能交互探索 · 端到端可交互原型<br>
> 分支：`feature/extension-deep-research`<br>
> 交互稿：`docs/原型/deep-research-interactive.html`（单文件 · 端到端可玩）<br>
> 设计基线：`docs/设计文档/Divisor-Agent-UI-设计规范.md`、生产代码 `packages/app/src/renderer/`

## 1. 这份交互稿是什么

一个**可以真正跑一遍完整流程**的交互原型，而非静态截图。打开 `deep-research-interactive.html`，通过底部「下一步」按钮（或键盘 `→` / `Enter`）逐步推进，体验 Deep Research 从触发到出报告的全过程。

它**严格对齐真实生产 UI**——所有 Design Token、组件结构、类名语义都取自 `packages/app/src/renderer/index.css` 与真实 React 组件，而不是臆想的样式。

## 2. 如何体验

1. 浏览器打开 `docs/原型/deep-research-interactive.html`
2. 底部有一个「驱动条」，显示当前步骤，点「下一步」推进（手动步进，方便逐帧观察每个状态）
3. 顶部「报告呈现」可切换 **Artifact 面板** / **内联消息** 两种最终报告呈现方式
4. 右上角可切换 亮/暗 主题
5. 可点击报告中的 citation 溯源；可折叠侧栏、开关报告面板

## 3. 覆盖的完整交互链路（7 步）

| 步骤 | 交互 | 对齐的真实组件 / 后端节点 |
| --- | --- | --- |
| 1 触发 | Composer 输入研究主题，`/deep-research` 以 mention chip 呈现，发送为 user 气泡 | `prompt-input` + slash `mention` chip + `user-message` 气泡 |
| 2 澄清 | Agent 反问，选项行可点选，支持跳过 | Deep Research 进度块 + 选项行（对齐 permission/ask 选项样式）|
| 3 计划 | 展示 4 个子任务，可编辑/添加/确认 | 进度块 + 子任务行（演进自 `SubagentsListBlock`）|
| 4 研究 | 子研究者状态逐步推进（排队→检索/思考→完成），来源计数递增，含阶段步进器 | `SubagentsListBlock` 行 + Lucide 状态图标（Circle/LoaderCircle spin/CheckCircle）|
| 5 反思 | Supervisor 反思条出现，追加第 2 轮搜索 | `think_tool` / 迭代循环，紫色反思条 |
| 6 报告 | 先流式打出摘要与关键发现（打字机效果 + 光标）| `AssistantResponseMessage` 流式 |
| 7 完成 | 报告落到 Artifact 面板 或 内联消息；citation 可溯源；导出/复制/追问 | Artifact 面板（紫色 Header + Tab）/ 带 citation 的 assistant message |

额外覆盖：**Steering**（研究中「追加指令」→ 弹出 Pending Messages 面板）、报告面板开关、侧栏折叠、亮暗主题。

## 4. 与真实生产 UI 的精确对齐点

交互稿不再基于旧原型 HTML，而是逐一复刻真实组件：

- **Design Token**：`--signal-cyan/purple/yellow/green/pink`、`--hard-shadow`/`--hard-shadow-sm`、`--radius: 0.375rem`，取自 `index.css`，亮暗两套。
- **身份徽章**：`34px` 方块，`YOU`(signal-yellow) / `AI`(signal-cyan)，`font-mono` `10px` `font-bold`，硬阴影——与 `user-message.tsx` / `assistant-message.tsx` 一致。
- **User 气泡 vs AI 无气泡**：User 消息 `border-2 bg-card` 气泡；AI 正文直接排版（`15px/1.7`）。
- **工具块 / 进度块**：左侧垂直 `TOOL`/`DEEP RESEARCH` 青色 tag 条 + 状态 + 可折叠——对齐 `assistant-tool-message.tsx`。
- **SubagentsListBlock**：进度块的子任务行复刻其 `bg-card border-border` 卡片、行 hover、Lucide 状态图标与 spin 动画。
- **Composer**：`max-w`、`rounded-lg`、focus ring；footer 左侧 Deep Research chip + 权限选择器，右侧模型选择器 + 发送按钮（`ArrowUp`；running 时变红 `Square`）——对齐 `prompt-input/index.tsx`。
- **Slash 命令**：输入 `/` 弹 suggestions 面板，`deep-research` 分组在 Extensions 下，选中插入 `signal-cyan` mention chip。
- **Artifact 面板**：`signal-purple` Header、Tab（报告/来源/大纲）、关闭按钮、来源卡片——对齐 `artifacts/index.tsx`。
- **Pending Messages**：steering 消息在 Composer 上方以黄色 Header 面板呈现——对齐 `pending-messages/index.tsx`。
- **图标**：全部用 Lucide 风格内联 SVG（Circle/LoaderCircle/CheckCircle/ArrowUp/Cpu/Shield/Panel 等）。

## 5. 两种报告呈现方式（可切换对比）

顶部「报告呈现」切换器让你直接对比：

- **Artifact 面板**：研究进度在 Chat 内进度块，最终报告落到右侧紫色 Artifact 面板（报告/来源/大纲三 Tab）。点击正文 citation → 打开面板 + 跳到「来源」Tab + 目标来源卡片高亮闪烁。适合长报告、反复查阅来源、宽屏。
- **内联消息**：报告直接作为一条带 citation 的 assistant message，点击引用弹出来源浮层，报告底部附来源清单。单栏、上下文连续、窄窗口友好。适合中短报告。

> 两者并非互斥：报告归宿可做成配置项，进度呈现可随窗口宽度自适应。

## 6. 推荐

- **主实现选 Artifact 面板模式**：最贴合设计规范中 Artifact 的既有定位，进度块可直接从 `extension-subagents` 的 `SubagentsListBlock` 演进而来。
- **内联模式作为轻量模式共存**：短研究或窄窗口时使用。

## 7. 下一步

交互与风格确认后，即可按 Artifact 模式搭 `extension-deep-research` 扩展包骨架：注册 `deep-research` slash command + 进度 assistant block + 报告 artifact，编排层复用 `ExtensionRuntimeAPI` 的 `createAgent/promptAgent/subscribeAgentEvents`。
