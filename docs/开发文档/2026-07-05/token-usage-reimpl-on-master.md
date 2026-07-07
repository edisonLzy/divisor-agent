# Token & Context Usage:在 master 新架构上重新实现(而非 merge 旧分支)

> 日期:2026-07-05(更新 2026-07-07)<br>
> 分支:`feature/token-usage`(base 最新 master `1e8299a`)<br>
> 关联:旧 PR #32 `codex/token-usage-metrics`(2026-06-24 base,落后 master 39 提交)

## 背景:为什么是「重新实现」而不是 merge

旧 #32 分支从 2026-06-24 分叉,仅含 1 个 feature commit,此后 master 经历 #37(per-channel IPC)、#38(raft UI 设计系统)、#49(prompt-editor API)、#50(human-in-the-loop)四轮大重构。直接 `git merge master` 会在 `agent-ipc.ts` / `active-session-content.tsx` / `assistant-message.tsx` / `use-chat-editor.ts` 上产生冲突,且即便解完,UI 仍停留在重构前的玻璃拟态风格,与现行设计规范(`docs/设计文档/Divisor-Agent-UI-设计规范.md`)不符。

**决策:** 从 master 切新分支,把旧 commit 当「需求规格 + 参考实现」,在新架构 + 设计系统上重写。天然无冲突,UI 从一开始贴规范。

## 架构演进

实现经历了三轮迭代,最终收敛到「纯 renderer 侧、独立 hook、entry 独立字段」的形态:

### 第一版(commit `e89e634`):agent-runtime 侧聚合 + IPC 通道

- `AgentRuntime.getContextUsage` 基于 `agent.state` 估算 context 构成
- 通过 `getContextUsage` IPC 通道暴露给 renderer
- `turnUsage` 附着在 assistant message 上,由 `use-agent-messages` 在 `turn_start`/`message_end` 累加 `entry.data.usage`

### 第二版(commit `df11810`):collapse 到 renderer 侧

- `turnUsage` 是纯 UI 概念,不应该污染 message payload(会影响 LLM 上下文)
- 去掉 `AgentRuntime` 侧的 `getContextUsage` 和 IPC 通道,改为 renderer 自行从 `entry.data.usage` 计算
- `stripAssistantUiMetadata` 不再需要

### 第三版(commit `4dd5b60`):独立 hook + entry 独立字段

- `entry.data.usage` 仍与 message payload 耦合,且 `use-agent-messages` 和 `use-side-chat-messages` 各有一份累加逻辑
- **解耦:** 创建 `EntryTokenUsage` 类型(`{ turn: Usage, latestCall: Usage }`),作为 `entry.tokenUsage` 独立字段存放
- **独立 hook:** `useAgentTokenUsage` 单独订阅 `message_end` 事件,不再依附于 `useAgentMessages` 的消息流
- **消费端简化:** `PromptInput` 从 `getEntryState` callback 改为直接接收 `tokenUsage` prop;`AssistantMessage` 从读 `message.usage` 改为读 `entry.tokenUsage`

## 最终实现:改了什么

### 数据模型

**`EntryTokenUsage`**(`packages/app/src/renderer/apis/sessions.ts`):
```ts
interface EntryTokenUsage {
  turn: Usage;       // 本轮所有 LLM 调用的累加(total)
  latestCall: Usage; // 最近一次调用的原始值,用于 context window 计算
}
```

- `turn` — 累加同一 turn 内多次 LLM 调用(工具循环)的 usage
- `latestCall` — 保留最近一次调用的原始值,`getCurrentContextTokens` 用它计算上下文窗口占用(`input + cacheRead + cacheWrite + output`)

**Store 变更**(`entries-slice.ts`):
- `AgentMessageEntry` 新增 `tokenUsage?: EntryTokenUsage` 字段
- 新增 `setMessageEntryTokenUsage(sessionId, entryId, tokenUsage)` action

### 核心逻辑

**`use-agent-token-usage.ts`** — 纯 renderer 侧 hook,独立订阅 `message_end`:

```
message_end 事件
  → isAgentAssistantMessage 守卫
  → 根据 event.scope 选择 mainStore / sideChatStore
  → 找到 streamingEntryId 对应的 entry
  → calculateEntryTokenUsage(entry.tokenUsage, message.usage)
  → store.setMessageEntryTokenUsage(...)
```

两个纯函数(可单测):

- `calculateEntryTokenUsage(existing, latestCall)` — 累加 `turn`,覆盖 `latestCall`
- `getCurrentContextTokens(tokenUsage)` — `latestCall.input + latestCall.cacheRead + latestCall.cacheWrite + latestCall.output`

**`token-usage.ts`** — 精简为纯工具函数,去掉 `summarizeUsage` / `estimateDraftTokens` / `createEmptyUsage`:
- `addUsage(left, right)` — 两个 Usage 逐字段相加
- `getPromptTokens(usage)` — input + cacheRead + cacheWrite
- `getCacheHitRate(usage)` — cacheRead / promptTokens
- `formatTokenCount` / `formatPercentage` — 紧凑格式化

### 消费端

**`PromptInput`**(`prompt-input/index.tsx`):
- props 从 `getEntryState: (sessionId: string) => EntryState` 改为 `tokenUsage?: EntryTokenUsage`
- `ContextUsageControl` 不再自行遍历 messages 计算 usage,直接用 `getCurrentContextTokens(tokenUsage)`
- 去掉 draft text 估算(`estimateDraftTokens` 移除)
- `Popover` → `HoverCard`,trigger 简化为 `size-6` 圆环(无文字)

**`AssistantMessage`**(`assistant-message.tsx`):
- 新增 `tokenUsage?: EntryTokenUsage` prop,从 entry 传入(而非 `message.usage`)
- `MessageUsage` 组件: `Popover` → `HoverCard`,新增 `getCacheTone` 缓存命中率颜色分级
  - 绿(≥80%):`--signal-green`
  - 黄(≥50%):`--signal-yellow`
  - 红(<50%):`--destructive`
- 只在非 streaming 且非 error 时显示 toolbar

**`use-agent-messages.ts` / `use-side-chat-messages.tsx`**:
- 去掉 `entry.data.usage` 的累加逻辑(`addUsage` 调用)
- `appendEntries` 时传递 `tokenUsage` 字段到 server 持久化

### UI:按设计规范重绘

两处主要 UI,均使用 raft 设计系统:

- **Context usage 环**(composer,模型选择器旁):
  - 信号色阈值:`--signal-cyan`(健康)→ `--signal-yellow`(≥65%)→ `--destructive`(≥85%)
  - trigger:`size-6` 圆环(conic-gradient),hover 时 `bg-muted`
  - HoverCard 展示:用量/总量、进度条、状态文字、剩余 tokens
- **本轮 Token 徽章**(assistant 消息工具栏):
  - HoverCard 展示:总量、cache hit rate(带颜色分级)、输入/输出/缓存明细
  - 所有数字 `font-mono`(规范 §4:机器状态/数字用 Space Mono)

## 验证

- `tsc` web + node 双侧 `--noEmit` 全绿
- 全量测试通过(含新增 `use-agent-token-usage.test.ts` 2 个单测)
- 改动文件 oxlint `--fix` 0 warning/error、oxfmt `--write` 已格式化
- 待办:production Electron 视觉手测(light/dark、hover/focus、长模型名)

## 关键决策记录

1. **token usage 是纯 UI 概念,不应污染 message payload**:`turnUsage` 和 `entry.data.usage` 先后被移除,最终收敛到 `entry.tokenUsage` 独立字段
2. **独立 hook 优于嵌入消息流**:`useAgentTokenUsage` 单独订阅 `message_end`,不依赖 `useAgentMessages` 的消息处理时序,避免两个 hook 之间的隐式耦合
3. **`latestCall` 用于 context 计算,`turn` 用于展示**:context window 关心的是「最近一次请求占了多少」,不是「本轮累计」,所以 `ContextUsageControl` 用 `getCurrentContextTokens`(只读 `latestCall`),而 `MessageUsage` 用 `turn`(展示本轮总消耗)
4. **去掉 draft text 估算**:`estimateDraftTokens` 在 CJK 场景下误差大(1:1 vs 4:1 是粗略启发式),且 context ring 用 `latestCall` 已经包含了最近一次请求的实际用量,比估算更准确