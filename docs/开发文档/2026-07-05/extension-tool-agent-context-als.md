# 扩展工具与所处 Agent 的上下文边界：为什么用 AsyncLocalStorage (2026-07-05)

## 背景

扩展工具通过 `ctx.extensionRuntime.askUserQuestion(input)` 发起一次 human-in-the-loop 询问。宿主侧 `ExtensionRuntimeService.askUserQuestion` 依赖 `AsyncLocalStorage`（下称 ALS）从"当前正在执行的工具上下文"中取回该工具所处的 `AgentRuntime`，再把询问转交给那个 runtime：

```ts
async askUserQuestion(input: AskUserQuestionInput): Promise<AskUserQuestionResult> {
  const context = this.runtimeContextStorage.getStore();
  if (!context) {
    throw new Error("Ask user question can only be called while an extension tool is executing");
  }
  return context.askUserQuestion(input);
}
```

`context.askUserQuestion` 由建立该上下文的 `AgentRuntime` 提供（见 `agent-runtime.ts` 组装 `getToolsForRuntime` 时注入的 `askUserQuestion: (input) => this.askUserQuestion(input)`）。真正的 sessionId 校验、scope 守卫、以及向 `AskUserQuestionService` 投递,都发生在**那个 runtime 内部**,单例服务只负责"把调用路由到正确的 runtime"。

> 早期实现里 `ExtensionRuntimeService` 亲自从 ALS 取 `sessionId` / `scope`、再调用一个全局单例 `AskUserQuestionService.requestForSession(sessionId, scope, input)`。后来 human-in-the-loop 的 ownership 统一收敛为 **per-runtime**（Permission 与 AskUserQuestion 对称,各自的 `AgentRuntime` 持有自己的 service）,单例服务与 sessionId 路由随之删除。本文记录的是收敛后的形态。

由此引出两个设计问题，本文记录讨论结论。

## 问题一：`askUserQuestion` 有必要用 `runtimeContextStorage`（ALS）吗？

**结论：有必要，且是正确选择。**

### Why

`ExtensionRuntimeService` 是**跨所有 agent 共享的单例**——main agent 以及每个 `createAgent` 出来的扩展 agent 都复用同一个实例。而它实现的 `MainExtensionRuntimeAPI.askUserQuestion(input)` 签名里**只有 `input`，没有任何 agent 标识**（见 `extension-core/src/main/define.ts`）。

扩展代码通过 `ctx.extensionRuntime.askUserQuestion(...)` 直接调用。此时单例必须回答一件事：**这次调用属于哪个 `AgentRuntime`**——只有找到那个 runtime，才能把询问投递给它自己的 `AskUserQuestionService`、并由它做 scope 守卫。

这个信息不在参数里，只能靠 `runWithContext` 在工具执行时建立的**环境上下文**恢复。`extension-service.ts` 的 `bindToolToRuntimeContext` 把每个扩展工具的 `execute` 都包在 `runWithContext(context, ...)` 里，其中 `context.askUserQuestion` 已被对应 runtime 绑好。因此工具体内调用 `askUserQuestion` 时 ALS 的 store 必然有值，且指向正确的 runtime。这正是 ALS 的典型用法：**在不改动函数签名的前提下传递"当前正在执行哪个 agent 的工具"这一隐式上下文。**

### 对比：`AgentRuntime.askUserQuestion` 就不需要 ALS

`agent-runtime.ts` 里的实现用的是 `this.sessionId` / `this.scope`——因为它**绑定到具体 runtime 实例**，天然知道自己是谁，不需要 ALS。收敛后,scope 守卫（`scope !== "main"` 抛错）与向 `this.askUserQuestionService.request(input)` 的投递都落在这里。

两者服务不同调用方：

| 实现 | 调用方 | 如何定位 runtime / 取 scope |
| --- | --- | --- |
| `AgentRuntime.askUserQuestion` | agent 内部 / context 注入 | 实例字段 `this.sessionId` / `this.scope`，持有 `this.askUserQuestionService` |
| `ExtensionRuntimeService.askUserQuestion` | 扩展工具代码直接调用（单例） | ALS `runtimeContextStorage` → `context.askUserQuestion` 转交给对应 runtime |

### 复用成本为零

ALS 在 `runtime-service.ts` 里**已被复用于多处**（`getCurrentAgentContext`、`createAgent` 的 `inherit-model` 所用的 `getCurrentModel`），并非只为 `askUserQuestion` 引入。`askUserQuestion` 复用它没有额外成本。

### 唯一的替代方案及其代价

要移除 ALS，只能把 agent 标识变成**显式参数**（让扩展作者自己传 sessionId 或 runtime 句柄）。但这会：

- 破坏 `MainExtensionRuntimeAPI` 公共签名，迫使扩展作者自己追踪并传入内部标识；
- 把宿主的内部标识符泄露到扩展 API 表面。

因此在"单例服务 + 无 agent 标识参数"的设计下，ALS 是唯一干净的上下文传递方式。

## 问题二：扩展中注册的 tool 应该关注自己所处的 agent 是哪个吗？

**结论：工具本身不应该关注、也不应该需要显式知道；当前架构正确地保证了它不需要关注。**

### 工具的心智模型 = 无状态的能力

一个扩展工具的理想形态是"给输入、产结果"，是一段**可被任意 agent 复用的能力**。同一个工具，main agent 用、side-chat agent 用、`createAgent` 出来的子 agent 也用。工具代码里若出现 `if (myAgent === "main")` 这类分支，就说明它被和某个具体 agent 耦合死了，失去复用性。

从**工具作者**视角：不该关注。作者写 `ctx.extensionRuntime.askUserQuestion(input)` 表达的意图是"问一下当前这个用户"，而不是"问 session-abc123 的用户"。让他去追踪 sessionId，是把宿主的记账义务甩给了扩展。

### "当前上下文"必须存在，且必须是隐式的

`askUserQuestion` 这类**副作用类**能力天然需要一个"投递目标"。这个目标不属于工具的**逻辑参数**（工具不关心），而属于**执行环境**（宿主关心）。

`runWithContext` + ALS 的价值正在于此：它把"你现在跑在哪个 agent 里"从工具的 API 表面**藏起来**，放进环境。工具作者看不到、不用管，但需要时（问用户、继承模型）宿主能取到。

> **关键认知：ALS 不是让工具感知 agent 的手段，而是屏蔽这种感知的手段。** 工具确实没关注所处 agent——是 `ExtensionRuntimeService` 在背后替它关注。当前设计恰恰"实现"了"工具不该关注所处 agent"这一理念。

### 需警惕的坏味道信号

真正该问的反向问题是：**有没有哪个扩展工具的业务逻辑里出现了对 scope / sessionId 的分支判断？**

- 没有 → 现状健康：工具是纯能力，上下文纯环境，边界清晰。
- 有 → 坏味道：说明某个能力被塞进了不该由它承担的**编排职责**。应把"哪个 agent 能做什么"的决策**上移到宿主**——例如通过 `getToolsForRuntime` 的 `excludeToolNames` 在**装配阶段**决定，而不是在执行阶段让工具自己判断。

现有的 `if (this.scope !== "main") throw` 就是这类判断，收敛后它落在 **`AgentRuntime` 自身**（拥有该能力的宿主层）而非工具层——这是**对的位置**。若哪天该约束漏进了具体工具代码，就该警觉。

## 决策落点

- 保留 `runtimeContextStorage`（ALS）方案，不改为显式传参；单例 `ExtensionRuntimeService` 只用它把调用路由到正确的 `AgentRuntime`。
- 约束"哪个 scope 能用某能力"的判断落在**持有该能力的 `AgentRuntime`**，不下沉到工具实现，也不再散落在单例服务里。
- 装配期的能力裁剪走 `getToolsForRuntime` 的 `excludeToolNames` / `includeExtensions`，不在运行期让工具自省 agent 身份。
