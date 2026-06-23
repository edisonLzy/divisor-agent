# pi-agent-core 版本选择：固定在 0.74.0

> 日期：2026-06-23
> 范围：`pnpm-workspace.yaml`、`pnpm-lock.yaml`
> 结论：`@earendil-works/pi-agent-core` 与 `@earendil-works/pi-ai` 固定为 `0.74.0`

## 一、背景

项目已从废弃的 `@mariozechner/*` scope 迁移到 `@earendil-works/*` scope。迁移后曾直接使用 `@earendil-works/pi-agent-core@0.79.10` 与 `@earendil-works/pi-ai@0.79.10`。

后续检查发现，`pi-agent-core@0.79.10` 的 npm 包中包含一整套 `dist/harness/*` 代码，包括 session repo、jsonl storage、skills、system prompt、compaction、node env 等能力。但当前 `divisor-agent` 已经在 Electron main 进程里实现了自己的运行时编排：

- `AgentRuntime` 负责 `Agent` 生命周期、system prompt、工具注入、权限拦截、模型切换和事件转发。
- `AgentPool` 负责多 session runtime 管理。
- Server 侧负责 session tree、history、rewind 等持久化语义。
- ExtensionService / SkillService 负责扩展工具与 prompt 拼装。

因此 core harness 的职责与当前应用架构存在明显重叠，短期没有接入价值。

## 二、版本事实

通过 `npm pack` 对比确认：

| 包版本 | 文件数 | 解包大小 | 是否包含 `dist/harness` |
| --- | ---: | ---: | --- |
| `@mariozechner/pi-agent-core@0.68.0` | 22 | 约 251KB | 否 |
| `@mariozechner/pi-agent-core@0.73.1` | 22 | 约 269KB | 否 |
| `@earendil-works/pi-agent-core@0.74.0` | 22 | 约 269KB | 否 |
| `@earendil-works/pi-agent-core@0.79.10` | 106 | 约 1.1MB | 是 |

`@earendil-works/pi-agent-core@0.74.0` 是迁移到新 scope 后仍保持轻量包结构的版本。它只包含当前项目实际使用的主能力：

- `Agent`
- `agentLoop`
- `runAgentLoop`
- `streamProxy`
- agent event / tool / message 相关类型

同时，`@earendil-works/pi-ai@0.74.0` 仍提供项目需要的 `Type`、`Static`、`TSchema`、`getProviders`、`getModels` 等 API。

## 三、决策

将 `@earendil-works/pi-agent-core` 与 `@earendil-works/pi-ai` 精确锁定到 `0.74.0`：

```yaml
catalog:
  "@earendil-works/pi-agent-core": 0.74.0
  "@earendil-works/pi-ai": 0.74.0

minimumReleaseAgeExclude:
  - "@earendil-works/pi-agent-core@0.74.0"
  - "@earendil-works/pi-ai@0.74.0"
```

注意这里必须使用精确版本，不使用 `^0.74.0`。因为 `0.74.2` 起 npm 包已经包含 `dist/harness/*`，使用 caret range 会让 pnpm 解析到更高版本，违背本次决策。

## 四、为什么不继续使用 0.79.10

### 4.1 依赖面与架构职责不匹配

`0.79.10` 中新增的 harness 代码覆盖 session、storage、prompt、skills、compaction、shell output 等运行时编排能力。这些能力不是简单工具函数，而是更上层的 agent harness 抽象。

当前应用已经有自己的 C/S hybrid 架构和 Electron 本地运行时。如果引入 `0.79.10`，即使不直接 import harness，也会在依赖包中携带一套当前不会使用的上层运行时实现，增加依赖面和后续升级判断成本。

### 4.2 当前公共 API 不需要 0.79.10

当前代码只依赖主入口的 `Agent`、`AgentEvent`、`AgentMessage`、`AgentTool` 以及 `pi-ai` 的模型和 typebox re-export。`0.74.0` 已覆盖这些需求。

`0.79.10` 的新增能力，例如 `base` / `node` 入口、`prepareNextTurn`、harness compaction/session，不是当前功能的必要条件。

### 4.3 降低隐性升级风险

`0.79.10` 要求 Node `>=22.19.0`，并额外引入 `ignore`、`yaml` 等依赖；`0.74.0` 要求 Node `>=20.0.0`，依赖面更小。对桌面应用来说，核心 agent runtime 越接近实际使用面越好，避免未来升级时被未使用模块的变更牵连。

## 五、验证

本次调整后的验证结果：

- `pnpm install --lockfile-only`：通过 supply-chain policy。
- `pnpm --filter @divisor-agent/app typecheck`：通过。
- 真实安装包检查：`@earendil-works/pi-agent-core@0.74.0` 安装目录无 `dist/harness`。
- 主入口导出检查：`@earendil-works/pi-agent-core` 不导出 `AgentHarness`。
- lockfile 审计：无 `0.79.10`、`dist/harness`、`agent-harness` 残留。

已知测试现状：

- 根脚本 `pnpm type-check` 目前调用的是 `pnpm -r run type-check`，但 app 包实际脚本名是 `typecheck`，因此根脚本本身不可用。这是已有脚本命名问题。
- `agent-runtime.test.ts` 的 mock 缺少 `Type.Array`，`registry.test.ts` 仍按同步方式使用 async 的 `getAvailableModels()`。这些是测试实现与当前生产代码不一致的问题，不属于本次依赖版本选择本身。

## 六、后续升级原则

未来如果要重新升级到包含 harness 的版本，需要先满足至少一个条件：

1. 明确计划使用 core harness 的 session / compaction / prompt / skills 抽象，并与现有 `AgentRuntime`、`AgentPool`、Server session tree 做边界重划。
2. 上游将 harness 拆成独立可选包或独立 export，主包不再强制携带当前未使用的上层能力。
3. `0.74.0` 缺少必须修复的安全问题、provider 兼容问题或当前功能必需 API，且无法通过小范围补丁规避。

在这些条件出现前，保持 `0.74.0` 是更符合当前应用架构和依赖治理原则的选择。
