# @divisor-agent/extension-subagents

让主 Agent 在处理可拆分任务时,能够并行起 1-4 个聚焦的子 Agent(子会话 / side-chat)同步调研,再把每个子 Agent 的结果汇回主 Agent。

包名已经按扩展命名规范命名为 `extension-subagents`,源码位于 `packages/extension-subagents/`。

## 功能概览

| 维度           | 内容                                                                               |
| -------------- | ---------------------------------------------------------------------------------- |
| Extension id   | `subagents`                                                                        |
| 注册的工具     | `subagents/run`                                                                    |
| 注册的指令     | `/subagent`(在输入框输入 `/` 弹出)                                                 |
| 注入系统提示   | `subagents.prompt` — 告诉主 Agent 何时以及如何调用本扩展                           |
| 渲染区块       | `subagents.list` — 在聊天流中实时展示每个子 Agent 的状态                           |
| 产物(Artifact) | 每个子 Agent 在主会话下创建一个 `side-chat` 类型的 artifact,点击列表行即可跳转查看 |
| 子 Agent 上限  | 4(同时运行)                                                                        |

## 架构

```
主 Agent (主会话)
   │
   │ 调用 subagents/run 工具,传入 1-4 个 task
   ▼
┌────────────────────────────────────────────────────────┐
│  subagents/run (主进程, src/main.ts)                    │
│  ─ 对每个 task:                                         │
│     1. 通过 ctx.runtime.createAgent(...)                │
│        → scope: "side-chat"                            │
│        → mode:  "inherit-model"(继承主 Agent 的模型)   │
│        → tools: 排除 subagents/run, fs/write_text_file, │
│                 terminal/create(避免子 Agent 再开子任务 │
│                 或写盘)                                 │
│     2. subscribeAgentEvents 把子 Agent 的进度            │
│        映射成 SubagentSnapshot                         │
│     3. onUpdate 把快照写回工具返回的 details,           │
│        让渲染端的 subagents.list 区块实时刷新            │
│     4. promptAgent 启动子 Agent                        │
└────────────────────────────────────────────────────────┘
   │
   │ 子 Agent 完成后
   ▼
汇总每个子 Agent 的 finalOutput / error → 返回给主 Agent
```

子 Agent 的所有事件(`agent_start` / `message_update` / `tool_execution_*` / `agent_end`)都会驱动 `SubagentSnapshot` 中的 `status` 与 `phase` 字段,渲染端据此更新图标、状态文本和"最近一次工具调用"等。

## 暴露的入口(`exports`)

| 子路径       | 来源               | 用途                              |
| ------------ | ------------------ | --------------------------------- |
| `./main`     | `src/main.ts`      | 主进程扩展:工具 + 系统提示        |
| `./renderer` | `src/renderer.tsx` | 渲染进程扩展:指令 + 区块          |
| `./types`    | `src/types.ts`     | 子 Agent 快照、工具事件等共享类型 |

主 App 通过 `packages/app/src/{main,renderer}/extensions/installed-extensions.ts` 直接引入 main / renderer definition，在两个进程各挂一次(参考 [electron-vite externalize 注意事项](#externalize-说明))。

## 工具 `subagents/run` 参数

```ts
{
  tasks: [
    { name: "string(可选,缺省 subagent-N)", task: "string(必填,非空)" },
    // 1 ≤ tasks.length ≤ 4
  ];
}
```

返回:

- `content`: 每个子 Agent 的最终输出,按 `## <name>\nStatus: ...\n\n<body>` 拼接
- `details`: `SubagentRuntimeSnapshot` — 渲染端据此渲染列表区块

错误处理:任意 task 字段缺失或为空时,直接抛错(`subagents/run requires 1-4 tasks, each with a non-empty task field`),工具调用整体失败,主 Agent 看到的就是错误结果。

## 渲染区块 `subagents.list`

点击行时:

1. `api.upsertArtifact(parentSessionId, { id, type: "side-chat", name })` — 在主会话下创建/复用 side-chat artifact
2. `api.appendSideChatMeta(artifactId, { context, mainSessionId, model, inputDisabled, pendingPrompt })` — 关联上下文
3. `api.insertSideChatUserMessageEntry(artifactId, { text: task }, 0)` — 把 task 作为用户消息插入子会话
4. `api.openArtifact(parentSessionId, artifactId)` — 在右侧面板打开

子 Agent 真正的执行过程是主 Agent 调工具时直接驱动的(`runtime.promptAgent`),side-chat artifact 主要承担"可回顾、可查看完整对话"的职责,而不是二次执行。

## 状态机

`SubagentStatus`:

| 值                             | 触发                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `queued`                       | 进入工具调用即初始值                                                         |
| `running`                      | `agent_start`                                                                |
| `completed`/`failed`/`aborted` | `agent_end`,按 `messages[].stopReason`(`end_turn` / `error` / `aborted`)判定 |

图标映射:queued → `CircleIcon`,running → `LoaderCircleIcon`(旋转),completed → `CheckCircleIcon`,failed → `XCircleIcon`,aborted → `OctagonXIcon`。

## 安装与启用

本扩展已经默认安装在 `packages/app` 中,无需额外步骤即可使用:

- 在聊天输入框输入 `/subagent`,选择 "Use subagents to run focused tasks in parallel" 即可插入提示模板
- 或者由主 Agent 根据任务情况自主决定调用 `subagents/run`

## <a id="externalize-说明"></a>externalize 说明

`@divisor-agent/extension-subagents` 与 `extension-core` / `extension-example` 一样是 **source-only** workspace 包,`package.json` 的 `exports` 直接指向 `.ts` 源文件,没有 `tsc` 构建步骤。

为了让 Electron 主进程在 dev 模式下能正确加载这个包,`packages/app/electron.vite.config.ts` 的 `build.externalizeDeps.exclude` 必须显式列出包名:

```ts
externalizeDeps: {
  exclude: [
    "@divisor-agent/extension-core",
    "@divisor-agent/extension-example",
    "@divisor-agent/extension-subagents",
  ],
}
```

如果将来移动到新的子路径或拆分出别的 source-only 包,记得同步更新这份清单(详见仓库根目录的 `CLAUDE.md`)。

## 依赖

- `@divisor-agent/extension-core` — 扩展运行时 API(`defineMainExtension` / `defineRendererExtension` / 工具 / 系统提示 / 运行时 / artifact / side-chat 元信息等)
- `@sinclair/typebox` — 工具参数 schema
- peer: `react` + `@types/react` + `lucide-react`

## 目录结构

```
packages/extension-subagents/
├── README.md
├── package.json
└── src/
    ├── extension.ts   # main / renderer 共用 metadata
    ├── main.ts        # 主进程:工具 + 系统提示
    ├── renderer.tsx   # 渲染进程:/subagent 指令 + subagents.list 区块
    └── types.ts       # 共享类型(子 Agent 快照、工具事件、运行时快照)
```
