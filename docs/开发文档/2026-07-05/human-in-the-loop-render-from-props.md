# Human-in-the-loop 面板改由 props 驱动，事件订阅抽出独立 hook (2026-07-05)

## 背景

human-in-the-loop（下称 HITL）的两类交互面板 —— `PermissionApprovalPanel` 与
`AskUserQuestionInteractionPanel` —— 此前各自内部再从 `mainStore` 订阅"当前请求"，
拿到 `request` 后渲染；同时 `use-agent-messages.ts` 里混着 `permission_requested` /
`ask_user_question_requested` 两个事件的入队逻辑。

外层 `HumanInTheLoopPanel` 其实已经持有 `request`（用 `request.kind` 分流到具体面板），
但面板内部又用 `useStore(mainStore, ...)` 把 `requests[0]` 重新捞一遍，导致：

- **双份来源**：外层已知的 `request` 与面板内部订阅的 `request` 是两条路径，面板还得
  处理 `request` 为 `null`（`if (!request) return null`）的分支，而这个分支在外层
  已经不可能发生。
- **职责错位**：HITL 事件（入队 + 同步 toolState）本与「agent 消息流」无关，却塞在
  `use-agent-messages.ts` 里，和 agent_start / tool_result 等混在一起。

## 改动

### 1. 面板改为 props 驱动

`HumanInTheLoopPanel` 把已持有的 `request` 直接透传给子面板：

```tsx
if (request.kind === "permission") {
  return <PermissionApprovalPanel request={request} sessionId={sessionId} />;
}
return <AskUserQuestionInteractionPanel request={request} sessionId={sessionId} />;
```

两个面板不再内部订阅 store：
- `useCurrentPermissionRequest(sessionId)` → `usePermissionRequest(sessionId, request)`
- `useCurrentAskUserQuestionRequest(sessionId)` → `useAskUserQuestionRequest(sessionId, request)`

hook 只保留 `submit` / `approve` / `deny` 等副作用，`request` 由参数传入。随之删掉了
面板内所有 `if (!request) return null` 空值分支 —— 因为类型上 `request` 恒非空。

### 2. HITL 事件订阅抽成独立 hook

新增 `use-human-in-the-loop-messages.ts`，把 `permission_requested` /
`ask_user_question_requested` 两个事件的处理从 `use-agent-messages.ts` 迁出。
`useAgentMessages()` 内改为调用 `useHumanInTheLoopMessages()`，两者仍在同一组件树内
运行，订阅时机不变，只是关注点分离。

### 3. 顺带清理

- `human-in-the-loop/index.ts` barrel 删除，`agent-runtime.ts` 改为直接从
  `ask-user-question-service.js` / `permission-service.js` 具体文件导入（遵循仓库
  「禁止 barrel」约定）。
- `AgentRuntimeDelegate` 的映射类型从「一长串 `Exclude` 联合」重写为具名的
  `SessionRoutedMethodNames`，可读性更好，语义不变。
- `ExtensionToolRuntimeContext` 去掉未使用的 `getScope()`；`agent-runtime.ts`
  组装工具上下文时同步移除 `getScope` 注入。
- `abstract-human-in-the-loop.ts` 的 `randomUUID`（node:crypto）换成 `uuid` 包的
  `v4`，与项目其余部分统一。

## Why

- **单一数据源**：`request` 从外层一路 props 透传，消除面板内的二次订阅与不可达的空值
  分支，渲染路径更直白。
- **关注点分离**：agent 消息流与 HITL 请求生命周期是两件事，拆开后各自的 hook 只订阅
  自己关心的事件。

## 影响面

纯前端/主进程内部重构，无对外行为变化。`pnpm --filter @divisor-agent/app run typecheck`
（node + web）通过。
