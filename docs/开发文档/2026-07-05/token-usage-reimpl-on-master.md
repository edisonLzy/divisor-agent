# Token & Context Usage:在 master 新架构上重新实现(而非 merge 旧分支)

> 日期:2026-07-05<br>
> 分支:`feature/token-usage`(base 最新 master `1e8299a`)<br>
> 关联:旧 PR #32 `codex/token-usage-metrics`(2026-06-24 base,落后 master 39 提交)

## 背景:为什么是「重新实现」而不是 merge

旧 #32 分支从 2026-06-24 分叉,仅含 1 个 feature commit,此后 master 经历 #37(per-channel IPC)、#38(raft UI 设计系统)、#49(prompt-editor API)、#50(human-in-the-loop)四轮大重构。直接 `git merge master` 会在 `agent-ipc.ts` / `active-session-content.tsx` / `assistant-message.tsx` / `use-chat-editor.ts` 上产生冲突,且即便解完,UI 仍停留在重构前的玻璃拟态风格,与现行设计规范(`docs/设计文档/Divisor-Agent-UI-设计规范.md`)不符。

**决策:** 从 master 切新分支,把旧 commit 当「需求规格 + 参考实现」,在新架构 + 设计系统上重写。天然无冲突,UI 从一开始贴规范。

## 改了什么

### 数据层(与 master 架构兼容,可直接搬)

- `src/shared/token-usage.ts`、`src/renderer/lib/token-usage.ts`:usage 求和(`addUsage`)、缓存命中率(`getCacheHitRate`)、token 估算(CJK 1:1 / 其余 4:1)、紧凑格式化。含 4 个单测。
- `AgentRuntime.getContextUsage`:基于 `agent.state`(systemPrompt / tools / messages)估算 context 构成,并用最近一次 assistant 的 `usage.totalTokens` 做缩放校准。`setHistoryMessages` 写回前用 `stripAssistantUiMetadata` 剥离 `turnUsage`,避免把 UI 元数据塞进 LLM 上下文。
- 主聊(`use-agent-messages.ts`)与侧聊(`use-side-chat-messages.tsx`)在 `turn_start` 记录 base usage,`message_update`/`message_end` 用 `withTurnUsage` 逐轮累加,支持工具循环内多次模型调用的合并。

### IPC 注册:一处结构性迁移

master #37 把会话 IPC 通道注册从 `agent-ipc.ts` 的自由函数搬进 `AgentPool.bind()` 的 `channels` 数组。因此 `getContextUsage` 的落点是:加进该数组 + 在 `AgentSessionIPC` 声明 + 加进 `events-ipc.ts` 的 `ALLOWED_RENDER_INVOKE_EVENTS`。`AvailableModel` 增补可选 `contextWindow`/`maxTokens`(**保留 `providerName`/`modelName` 为必填**,不采用旧分支把它们改可选的做法——那只是旧分支为绕过自身类型问题而做,master 无此需要)。

### UI:按设计规范重绘(非照搬旧实现)

旧实现使用玻璃拟态 + `chart-*` 色,均违反规范 §2.2 / §3。两处重绘:

- **Context usage 环**(composer,模型选择器旁,`prompt-input/index.tsx`):
  - 杀掉 `var(--chart-2/3)` —— master 里 `chart-*` 是灰阶(`oklch(0.556 0 0)`),直接用会**无色**。改为**信号色阈值**:`--signal-cyan`(健康)→ `--signal-yellow`(≥65%)→ `--destructive`(≥85%)。
  - trigger 对齐 `ModalSelector` 的 `h-7 border-2 border-border rounded-sm bg-card shadow-[var(--hard-shadow-sm)]`,成为 footer 一致的按钮态,而非悬浮玻璃 chip。
  - popover 去 `rounded-2xl`/`bg-popover/96`/`backdrop-blur-xl`/任意模糊阴影 → `rounded-md border-2 border-border bg-popover shadow-[var(--hard-shadow)]`。
  - 所有数字 `font-mono`(规范 §4:机器状态/数字用 Space Mono)。
- **本轮 Token 徽章**(assistant 消息工具栏,`assistant-message.tsx`):popover 同样去玻璃拟态→硬阴影;`UsageMetric` 卡片 `rounded-xl bg-muted/70` → `rounded-sm border-2 border-border bg-muted`;数字 `font-mono`。

## 验证

- `tsc` web + node 双侧 `--noEmit` 全绿
- 全量 16 test files / 103 tests 通过(含新增 4 个 token-usage 单测)
- 改动文件 oxlint `--fix` 0 warning/error、oxfmt `--write` 已格式化(遵守「只 scope 改动文件」约定)
- 待办:production Electron 视觉手测(light/dark、hover/focus、长模型名)需本地跑 app 完成

## 遗留决策

token 徽章目前是「紧凑文字(总量/缓存/命中率)+ ChevronDown 展开明细」,信息量比旁边 Copy/Fork 纯图标更重(规范 §6.2 建议次级操作用 ghost/icon 不抢正文层级)。保留了参考实现的信息密度;若需更克制,可退化为单图标 + 全明细收进 popover。
