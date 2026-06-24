# pi-agent-core / pi-ai 依赖迁移

> 日期：2026-06-23
> 范围：`packages/app`、`packages/extension-core`、`packages/extension-example`、`packages/extension-subagents`
> 提交：`chore(deps): migrate from deprecated @mariozechner/* to @earendil-works/*`

## 一、背景（Why）

`@mariozechner/pi-agent-core` 与 `@mariozechner/pi-ai` 已被上游标记为 **DEPRECATED**：

```
DEPRECATED ⚠️  - please use @earendil-works/pi-agent-core instead going forward
```

`pi-mono` 仓库的所有权从 `mariozechner`（个人 scope）迁移到了 `earendil-works`（组织 scope），包名同步变更。继续停留在旧 scope 的风险：

1. **安全更新断档**：上游只在新 scope 发布补丁，不再为旧 scope 维护。
2. **生态位错位**：新功能、provider、新模型定义都只在新 scope 出现。
3. **潜在 API drift**：旧 scope 会被冻结，迟早出现与新 scope 行为不一致的 case。

`divisor-agent` 是以 `pi-agent-core` 作为 Agent runtime 核心的项目，必须跟随升级。

## 二、核心决策（Why，重点）

迁移过程中遇到一个看起来是"风格选择"、实际是**架构一致性**的决策点。记录如下。

### 2.1 关键事实：上游换了 typebox

新包 `@earendil-works/pi-ai@0.79.10` 内部依赖的是新版 `typebox@1.1.38`（包名直接叫 `typebox`），不再是 `@sinclair/typebox@0.34.x`。从打包产物里可以直接看到：

```ts
// @earendil-works/pi-ai/dist/base.d.ts
export type { Static, TSchema } from "typebox";
export { Type } from "typebox";
```

而 `pi-agent-core` 内部 `AgentTool` 的泛型约束也跟着切到了新 typebox：

```ts
// @earendil-works/pi-agent-core/dist/types.d.ts
import type { Static, TSchema } from "typebox";
export interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any>
  extends Tool<TParameters> { ... }
```

也就是说：**`AgentTool<TParams extends TSchema>` 这个约束，是新 typebox 的 `TSchema`**。任何要传给 `AgentTool` 的 `parameters` 字段，必须用新 typebox 的 `Type.Object(...)` 构造，否则不满足约束。

### 2.2 决策：Type / TSchema / Static 全部从 `pi-ai` 导入

`pi-ai` 已经是新 typebox 的官方重导出点。如果项目里继续从 `@sinclair/typebox@0.34` 直接导入 `Type`，会出现以下两条断链：

| 文件 | 上下文 | typebox 版本 |
| --- | --- | --- |
| `extension-core/src/main/define.ts` 的 `register<TParams extends TSchema>` | 约束 | 上游要求新 typebox |
| 扩展里 `parameters: Type.Object(...)` | 实际 schema 构造 | 旧 `@sinclair/typebox@0.34` |
| `app/src/main/tools/types.ts` 的 `AppTool<TParams extends TSchema>` | 约束 | 上游要求新 typebox |
| `app/src/main/tools/{fs,terminal}-tool.ts` 的 `Type.Object(...)` | 实际 schema 构造 | 旧 `@sinclair/typebox@0.34` |

结果就是 tsc 编译期报：

```
Type 'TObject<{ path: TString; }>' does not satisfy the constraint 'TSchema'.
  Type 'TObject<{ path: TString; }>' is missing the following properties from type 'TSchema':
  params, static, [Kind]
```

`[Kind]` 是新 typebox 用 Symbol 标记 schema 种类的关键字段，旧 typebox 没有——这正是两个 typebox 包不兼容的根因。

**因此决定**：

- `Type`、`Static`、`TSchema` 统一从 `@earendil-works/pi-ai` 导入
- 移除独立的 `@sinclair/typebox` 依赖（`packages/app/package.json`）
- 替换 `extension-example` / `extension-subagents` 的 `@sinclair/typebox` 直接依赖为 `@earendil-works/pi-ai`
- 替换 `extension-core` 的 `@sinclair/typebox` peerDep 为 `@earendil-works/pi-ai`

这样**约束和实现用的是同一个 typebox**，类型校验自动通过，运行时也避免 schema 验证在不同 typebox 实现间穿梭。

### 2.3 备选方案与不采纳的理由

| 备选 | 不采纳的原因 |
| --- | --- |
| 继续用 `@sinclair/typebox@0.34` 的 `Type` 构造 schema，再用 `as` 强转 | 类型层断裂、运行时两层 typebox 共存，迟早踩坑 |
| 在每个工具文件里手动重导出 `Type` from `pi-ai`，约束仍用 `@sinclair/typebox` | 同上，问题没解决 |
| 锁定 `@earendil-works/pi-agent-core` 的旧版本（如 0.74.2 legacy-node20） | 上游就是新版本，问题没消失，只是延后 |
| 整体不引入 `Type`、改用 `zod` | `AgentTool` 约束就是 `TSchema`，要绕开就等于脱离上游 API |

## 三、变更内容（How）

### 3.1 版本号

| 包 | 旧 | 新 |
| --- | --- | --- |
| `@mariozechner/pi-agent-core` | `^0.68.0` | → `@earendil-works/pi-agent-core@^0.79.10` |
| `@mariozechner/pi-ai` | `^0.68.0` | → `@earendil-works/pi-ai@^0.79.10` |

### 3.2 package.json 改动

| 文件 | 改动 |
| --- | --- |
| `packages/app/package.json` | 替换两处 deps；移除 `@sinclair/typebox` |
| `packages/extension-core/package.json` | peerDep `@sinclair/typebox` → `@earendil-works/pi-ai` |
| `packages/extension-example/package.json` | dep `@sinclair/typebox` → `@earendil-works/pi-ai` |
| `packages/extension-subagents/package.json` | dep `@sinclair/typebox` → `@earendil-works/pi-ai` |

### 3.3 源码导入改动（24 处 import + 2 处 vi.mock）

| 类别 | 文件 |
| --- | --- |
| `AgentTool` / `AgentMessage` / `AgentEvent` 来源 | `agent-runtime.ts`、`tools/types.ts`、`shared/events-ipc.ts`、`shared/session-ipc.ts`、`store/entries-slice.ts`、`renderer/lib/agent-message.ts`、`extension-core/src/main/define.ts`、`extension-core/src/main/registry.ts` |
| `UserMessage` / `AssistantMessage` / `ToolCall` / `ToolResultMessage` / `Api` / `Model` / `OAuthProviderInterface` 来源 | `renderer/lib/agent-message.ts`、`renderer/lib/agent-tool.ts`、`renderer/lib/is.ts`、`renderer/store/entries-slice.ts`、`renderer/pages/workspace/use-agent-messages.ts`、`renderer/pages/workspace/chat/messages/assistant-message.tsx`、`renderer/pages/workspace/chat/artifacts/side-chat-artifact/use-side-chat-messages.tsx`、`main/models/registry.ts` |
| `Type` / `TSchema` / `Static` 来源（关键决策） | `app/src/main/tools/{fs,terminal}-tool.ts`、`app/src/main/tools/types.ts`、`extension-core/src/main/define.ts`、`extension-example/src/main.ts`、`extension-subagents/src/main.ts` |
| `vi.mock(...)` 调用 | `__tests__/main/agent-runtime.test.ts`、`__tests__/main/models/registry.test.ts` |

### 3.4 验证

- ✅ `tsc --noEmit -p packages/app/tsconfig.node.json`：通过
- ✅ `tsc --noEmit -p packages/app/tsconfig.web.json`：通过
- ✅ `pnpm install` 成功，`@sinclair/typebox` 从 lockfile 移除
- ✅ `grep -r "sinclair" packages/`：0 命中
- ✅ `grep -r "mariozechner" packages/`：0 命中
- ⚠️ `agent-runtime.test.ts` / `registry.test.ts` 仍存在失败用例

### 3.5 遗留失败用例

迁移后跑测试时发现 `registry.test.ts`（8 个）和 `agent-runtime.test.ts`（9 个）共 17 个用例失败。`git stash` 回到升级前代码重新跑，结果一致——**这 17 个失败是升级之前就存在的**：

- `registry.test.ts` 的失败源于 `getAvailableModels()` 是 async 但测试里没 await（pre-existing 测试 bug）
- `agent-runtime.test.ts` 的失败是相关 mock 与运行时初始化顺序的旧问题

不在本次迁移范围内。已确认升级本身**没有引入新失败**。

## 四、影响面与兼容窗口

### 4.1 外部可见影响

- **API 形态不变**：`Agent`、`AgentMessage`、`AgentEvent`、`AgentTool`、`UserMessage`、`AssistantMessage` 等导出的类型名和形状兼容。
- **导入路径变化**：所有调用方（包括自定义 extension）必须把 `@mariozechner/...` 改成 `@earendil-works/...`。这是 breaking change，但项目内全量可控。
- **`@sinclair/typebox` 移除**：`@sinclair/typebox@0.34` 之前在 4 个包里作为直接 / peer 依赖，迁移后这 4 个包都不再持有。pnpm-lock 净减约 780 行（`pnpm-lock.yaml` 的 -1148 vs +368）。

### 4.2 给扩展作者的影响

第三方扩展（如果有）此前可能用 `@sinclair/typebox` 构造 `parameters`。**必须改成从 `@earendil-works/pi-ai` 导入 `Type`**，否则 `register<TParams extends TSchema>` 这一步在 extension-core 里就会报 schema 不满足约束。

文档层面尚未同步告知第三方扩展作者——目前 `extension-core` 的 README 写得不完整，建议后续补一节"扩展迁移指南"。

## 五、回顾（教训 / 后续）

1. **跨包共享 schema 类型时，约束与实现必须同源**。本次踩坑的本质是 `AgentTool<TParams extends TSchema>` 来自上游、`Type.Object(...)` 来自项目自有 typebox——两边各管各的，编译期才发现。下次引入新的"上游 schema 库"时，第一步就检查"上游用哪个 typebox 版本"，把项目自己的 typebox 锁到同一版本或干脆删掉。
2. **deprecated 包应优先迁移**。本次 `0.68.0` → `0.79.10` 的版本跨度不算大，但跳过了 11 个 minor。越往后拖越难——上游的 typebox 还会继续演进，TSchema 形状说不定还会再变。
3. **测试用例应该与生产代码一起升级**。这次发现 17 个 pre-existing 失败——上游升级是一个契机把这些老问题一起清掉，但没有强制要求。下次遇到类似升级时，建议在 PR 里加一条 checklist："pre-existing 测试失败是否已处理"。
4. **README / CLAUDE.md / AGENTS.md 里的旧包名还没改**（`docs/技术文档/mvp/前端.md` 同理）。这次只改了源码和 lockfile，文档留作下一个 commit——避免单次 PR 文件过多。**待办**：见后续工作项。

## 六、待办

- [ ] 同步 `README.md`、`CLAUDE.md`、`AGENTS.md`、`docs/技术文档/mvp/前端.md` 里的 `@mariozechner/pi-agent-core` 字样
- [ ] `docs/调研文档/pi-agent-core适用性分析.md` 保留不动（历史调研记录）
- [ ] 决定是否补一个 `extension-core` 的"扩展迁移指南"小节
- [ ] 修复 `registry.test.ts` / `agent-runtime.test.ts` 的 17 个 pre-existing 失败用例（建议拆独立 PR）
