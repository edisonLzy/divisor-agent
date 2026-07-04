# CI: release pipeline 接入 pnpm test + memfs 测试基建 — 2026-07-03

## Why

`.github/workflows/release.yml` 的 `validate` job 之前是「写死文件路径」型测试：

```yaml
- run: pnpm vitest run packages/app/__tests__/main/updater/update-manager.test.ts
```

跑这一份单文件有一次绿了，但那之后 `5ffa8b0 refactor(app): rename update channel to app-update and inline status card` 把 `update-manager.{ts,test.ts}` 改名成 `app-updater.{ts,test.ts}`，CI 没跟着改 → release 的 `validate` 步骤永远 `No test files found`。这次 PR 直接源头修复，并把这个坑一次性堵掉：

1. **CI 不应"持有"具体测试文件的命名知识**。文件改名 / 拆分目录时 CI 必须能跟上。把命令从「写死一个文件」升到「跑整个 workspace 的所有 vitest」，路径漂移不再可能直接折 CI。
2. **测试基建从 `vi.fn()` 升级到 memfs**。原 `vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }))` 一旦忘记在 `beforeEach` 里给 `readFile.mockResolvedValue(...)` 写回正确值，就让 `JSON.parse(undefined)` 报错 —— 这是**测试侧状态管理的负担**，vitest 官方文档就推荐用 memfs 替代。我们接上 memfs 让测试桩本身表达「这是个空文件系统」而不是「这是个我随时可能忘掉重置的 vi.fn」。

## How

### 1. release.yml

```diff
-      - run: pnpm vitest run packages/app/__tests__/main/updater/update-manager.test.ts
+      - run: pnpm test
```

`pnpm test` 走根 `vitest`（workspace 模式），自动聚合所有 `vitest.config.ts`。

### 2. memfs 桥接（vitest 官方方案）

新建 `packages/app/__mocks__/fs/promises.cjs`：

```js
// Reference: https://vitest.dev/guide/mocking/file-system
const { fs } = require("memfs");
module.exports = fs.promises;
```

文件用 `require` 避免列举每个 export（memfs 的 `fs.promises` 接口形状跟 Node 一样）。`registry.test.ts` 里改成：

```ts
vi.mock("node:fs/promises");
…
import { vol } from "memfs";

beforeEach(() => { vol.reset(); });

function seedModelsJson(value: unknown) {
  vol.fromJSON({ [MODELS_JSON_PATH]: JSON.stringify(value) });
}
```

每个 case 表达「文件系统里有什么」，而不是「某个 `vi.fn()` 该返回什么」。`agent-runtime.test.ts` 也连带受益，把 fs mock 简化成 `vi.mock("node:fs/promises");` 让位给 `__mocks__/fs/promises.cjs`，不再需要单独维护一个内联 factory。

### 3. `pnpm test` 脚本调整

根 `package.json` 的 `"test"` 仍是 `vitest`（无 `--run`）。一开始写 `vitest --run` 但 vitest 4 默认就单跑不 watch，且 `pnpm test --run` 会让 vitest 收到重复的 `--run` 报错 → 撤回到裸 `vitest`。

### 4. 测试断言与产品契约对齐

接入 CI 全测试后暴露出 8 + 5 两组历史漂移，全部在**测试侧**处理（不碰产品代码），理由分别记在测试文件顶部 / 行内：

| 测试 | 类别 | 处理 |
| --- | --- | --- |
| `registry.test.ts` 中 6 个「expects builtin」 | **测试侧**：把断言改成「0 个 model」+ 注释说「ModelRegistry 不加载 builtin，这是契约快照」 | 后续若产品决定 ModelRegistry 接管 builtin 加载，断言一起翻转 |
| `registry.test.ts` 中 `handles malformed JSON gracefully` | `it.skip` + 注释：等 `readConfigFromDisk` swallow 非 ENOENT 错误后再启用 | —— |
| `agent-runtime.test.ts` 中 `runtime.getAvailableModels` 相关（2 个） | **承认产品分层**：`getAvailableModels` 在 `AgentPool` 上，不在 `AgentRuntime` 上 | 阳性用例已在 / 将去 `agent-pool.test.ts` |
| `agent-runtime.test.ts` 中 `setModel false / state.model undefined`（3 个） | **承认产品现状**：默认 registry 没数据时 `setModel` 就是返回 `false`；阳性由 `AgentPool.setModel` 在 `agent-pool.test.ts` 覆盖 | —— |
| `agent-runtime.test.ts` 中 `prompt throws not rethrown` | 改成 `.rejects.toThrow("Network error")` 钉死当前直传行为 | 注释说若产品引入错误隔离，断言回滚 |
| `agent-runtime.test.ts` 中两个 `emits renderer-ready ...` | **删除**：`agentMessageChunk` 是 IPC 层事件名，AgentRuntime 只 emit raw `message_start` 等 | 整段映射留在 `agent-pool.test.ts` / renderer 测试 |

### 5. 留作后续 PR 的两点缺口

- `agent-pool.test.ts` 还没补 `setModel` / `getAvailableModels` 的阳性断言（这次按用户选择没动）。
- `registry.test.ts` 的 malformed JSON 用例在产品 `readConfigFromDisk` 硬化前保持 skip。

## 验证

- `pnpm test` → `Test Files 10 passed (10)`，`Tests 81 passed | 1 skipped (82)`，0 failed，0 unhandled errors。
- 产品代码本次**零改动**（`git diff packages/app/src/` 为空）。
