# Human-in-the-Loop 抽象 + Ask User Question (2026-07-05)

## Why

此前"暂停 Agent、等用户输入、再继续"的能力只有权限审批（Permission）一条链路，逻辑内聚在 `PermissionService` 里：pending map、resolve/reject、requestId 生成、跨 session 取消等，全部各自实现。

现在需要新增第二种"打断式交互"——扩展工具主动向用户发起**结构化提问**（`ask-user-question`：单选 / 多选 / Other + 补充说明），让扩展在工具执行中途收集用户偏好后再继续。

如果为 `ask-user-question` 再抄一遍 `PermissionService` 的 pending/resolve/cancel 机制，两条链路会各自漂移。因此先把两者共有的"发起请求 → 挂起 Promise → 由外部 resolve/cancel"生命周期抽出为 `AbstractHumanInTheLoop`，权限与提问各自作为它的子类，只实现 payload/result 的校验与归一化。

渲染端同理：权限请求原本单独占用 `permission-slice` 的队列。新增提问后，两类请求需要在同一个会话里**按到达顺序排队、互斥展示**（同一时刻只弹一个面板），所以队列也上收到统一的 `human-in-the-loop-slice`，`permission-slice` 退化为只保留权限模式（mode）。

## How

### 1. 主进程：`AbstractHumanInTheLoop` 抽象基类

**新增** `packages/app/src/main/human-in-the-loop/abstract-human-in-the-loop.ts`：

- 继承 `Emittery`，对外只发一个 `"human-in-the-loop"` 事件，携带 `{ requestId, kind, createdAt, payload }`。
- `request(payload)`：`parsePayload` 校验 → 生成 `randomUUID` → 挂起 Promise 存进 `pendingRequests` map → emit 事件 → 返回 Promise。
- `resolve(requestId, value)`：`parseResult` 校验后 resolve 对应 Promise。
- `cancelAll(reason)` / `cancelWhere(predicate, reason)`：用 `HumanInTheLoopCancelledError` reject 挂起项，支持按 session 精准取消。
- 抽象方法 `parsePayload` / `parseResult` 交子类实现——**校验与归一化收敛在这一层**。

### 2. 主进程：两个子类

- `permission-service.ts`：`PermissionService extends AbstractHumanInTheLoop<"permission", PermissionPayload, PermissionResolution>`。保留 `setRequestCallback` / `rememberApproval` / `shouldAutoApprove` / `approve` / `reject` 等原有外部 API，内部改为委托基类。通过监听自身 `"human-in-the-loop"` 事件把请求转发给 `onRequestCallback`（`AgentRuntime` 消费）。
  - **移除** 旧的 `packages/app/src/main/permissions/`（`index.ts` + `permission-service.ts`），旧测试同步删除，新测试迁到 `__tests__/main/human-in-the-loop/`。
- `ask-user-question-service.ts`：`AskUserQuestionService`，payload 带 `sessionId` + `scope`。`parsePayload` 强校验：1–3 个问题、header ≤12 字符、每题 2–3 个选项、label 唯一、问题文本唯一;`parseResult` 校验每题都作答、选项合法、单选不允许多选/选项与自定义答案共存、必须有答案。提供 `requestForSession` / `resolveForSession` / `cancelForSession`。
- `index.ts`：导出三者（此 `index.ts` 汇聚同目录实现文件，非跨模块 barrel）。

### 3. 主进程：接线

- `agent-runtime.ts`：`PermissionService` 改从 `human-in-the-loop` 导入;`randomUUID` / `createdAt` 由基类生成，权限请求对象移除这两个字段。`abortPrompt` / `destroy` 时 `permissionService.cancelAll(...)`，防止挂起的权限请求泄漏。工具运行时上下文新增 `getScope()`。
- `agent-pool.ts`：持有 `AskUserQuestionService`，监听其 `"human-in-the-loop"` 事件并展开为 `ask_user_question_requested` IPC 事件发往渲染端;新增 `resolveAskUserQuestion` IPC 委托;在 `destroyAgent` / `abortPrompt` / `dispose` 时按 session 取消对应的提问请求。
- `extensions/runtime-service.ts`：`ExtensionRuntimeService` 额外实现 `MainHumanInTheLoopAPI`，`askUserQuestion(input)` 从 `AsyncLocalStorage` 取当前工具上下文，校验有 sessionId 且 `scope === "main"`（仅主 Agent 支持），转发给 `AskUserQuestionService.requestForSession`。
- `extensions/extension-service.ts`:`HostMainExtensionContextValues` 注入 `humanInTheLoop: runtimeService`;工具运行时上下文接口加 `getScope()`。

### 4. extension-core：对扩展开放的 API

- **新增** `src/common/human-in-the-loop.ts`:`AskUserQuestion` / `AskUserQuestionOption` / `AskUserQuestionInput` / `AskUserQuestionAnswer` / `AskUserQuestionResult` 类型。
- `src/common/index.ts`:`export type { ... }` 上述类型。
- `src/main/define.ts`:新增 `MainHumanInTheLoopAPI` 接口，`HostMainExtensionContextValues` 加 `humanInTheLoop` 字段，扩展工具通过 `ctx.humanInTheLoop.askUserQuestion(...)` 调用。
- `src/main/index.ts`:导出 `MainHumanInTheLoopAPI` 类型。

### 5. shared IPC

- **新增** `src/shared/ask-user-question-ipc.ts`:`AskUserQuestionRequest`（带 `requestId` / `createdAt` / `kind: "ask_user_question"`）、`AskUserQuestionRequestedEvent`、`AskUserQuestionResolution`。
- `permissions-ipc.ts`:拆出 `PermissionPayload`（工具信息），`PermissionRequest extends PermissionPayload` 再加 `requestId` / `createdAt` / `kind: "permission"`——两类请求都带 `kind` 判别字段，便于渲染端联合类型区分。
- `session-ipc.ts`:`AgentSessionIPC` 新增 `resolveAskUserQuestion`。
- `events-ipc.ts`:`ask_user_question_requested` 加入主→渲染白名单，`resolveAskUserQuestion` 加入渲染→主白名单，`AgentRuntimeEvent` 联合类型纳入新事件。

### 6. 渲染端：独立的 ask-user-question slice

主进程用 `AbstractHumanInTheLoop` 收敛了生命周期，但渲染端两类请求的**状态形态并不相同**（权限请求还要携带 `mode`、审批语义;提问是纯问答队列），且权限 slice 已在别处被广泛消费。因此渲染端不强行合并成一个 slice，而是让提问**平行**新增一个 slice，权限 slice 原样保留自己的队列。

- **新增** `store/main/ask-user-question-slice.ts`:`askUserQuestionStates: Map<sessionId, { requests, lastResolvedRequest }>`。`enqueueAskUserQuestionRequest` 按到达顺序追加;`resolveAskUserQuestionRequest` 只移除对应 requestId 并记录 `lastResolvedRequest`;`clearAskUserQuestionState` 清理会话。
- `permission-slice.ts`:保留原有 `mode` + `requests` 队列与 `enqueue/resolve/clear`，仅做等价重排（无行为变化）。
- `store/main/index.ts` + `store-state.ts`:接入 `AskUserQuestionSlice`。
- `session-slice.ts`:destroy session 时一并清理 `askUserQuestionStates`。

### 7. 渲染端：面板、选择器与消费

- **新增** `chat/prompt-area-content.ts`:纯函数 `selectPromptAreaContent(hasPermission, hasAskUserQuestion)` 决定输入区展示哪一种——**权限优先于提问，二者都无则回落到 PromptInput**。互斥展示的优先级逻辑收敛在这个可单测的纯函数里。
- **新增** `chat/ask-user-question/index.tsx`:`AskUserQuestionPanel`——分步问答（数字键选择、Enter 继续、ArrowLeft 返回）、Other 自定义答案、汇总复核页、补充说明 Textarea，提交走 `resolveAskUserQuestion` IPC 并同步本地 slice。
- `active-session-content.tsx`:分别读 `getPermissionState` / `getAskUserQuestionState` 的队首，用 `selectPromptAreaContent` 得到 `"permission" | "ask-user-question" | "prompt-input"`，据此渲染 `PermissionApprovalPanel` / `AskUserQuestionPanel` / `PromptInput`。
- `use-agent-messages.ts`:新增 `ask_user_question_requested` handler 入 ask 队列;`permission_requested` 仍走权限 slice（未改动）。
- 权限侧的 `use-current-permission-request.ts` 未改动——权限链路保持原样。

### 8. extension-example:参考实现

`src/main.ts` 注册 `example/ask-user-question` 工具，演示 `ctx.humanInTheLoop.askUserQuestion(...)`（单选 Format + 多选 Sections），返回结构化结果。README 同步补充说明与试用步骤。

## 测试

- `__tests__/main/human-in-the-loop/permission-service.test.ts`:审批/拒绝/记忆前缀自动放行。
- `__tests__/main/human-in-the-loop/ask-user-question-service.test.ts`:归一化请求、resolve、非法问题数/未答校验、cancel。
- `__tests__/renderer/store/main/ask-user-question-slice.test.ts`:提问请求按序排队、只移除已 resolve 项。
- `__tests__/renderer/store/main/permission-slice.test.ts`:排队/解决期间保留权限 mode。
- `__tests__/renderer/pages/workspace/chat/prompt-area-content.test.ts`:选择器优先级（permission > ask > prompt-input）。
- `__tests__/main/agent-pool.test.ts`:端到端——extension-example 通过 `humanInTheLoop` 收集结构化反馈。

全部 29 个用例通过，app 包 `tsc --noEmit` 无错误。
