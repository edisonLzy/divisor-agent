# Store 目录组织规则

本目录管理 renderer 进程所有 Zustand store。遵守以下规则可以让 store 边界清晰、避免数据冗余、便于后续扩展。

## 目录结构

```
store/
  types.ts              -- 共享类型定义（所有 slice 接口、组合 store 类型）
  entries-slice.ts      -- 可复用：统一的 entries 管理工厂
  index.ts              -- 类型 barrel（仅 re-export types，不导出 store 实例）

  main/
    index.ts            -- mainStore 组合入口
    session-slice.ts    -- 主会话生命周期
    permission-slice.ts -- 权限状态
    artifact-slice.ts   -- 通用 artifact 面板

  side-chat/
    index.ts            -- sideChatStore 组合入口
    side-chat-slice.ts  -- 侧边栏元数据
```

## 核心原则

### 1. 一个 store 目录 = 一个独立的 Zustand store

每个子目录（`main/`、`side-chat/`）对应一个独立 store，目录内的 `index.ts` 负责 `createStore` 组合。**不要**在子目录外创建第二个 `createStore`，**不要**用单个全局 store 跨域组合。

**为什么**：每个领域的主会话和侧边栏是独立的 IPC 路由目标（`sessionId` 区分），需要独立的状态生命周期。合并到一个 store 会让 `removeSession` 等操作做不必要的跨领域清理，也让订阅粒度变粗。

### 2. `entries-slice.ts` 是可复用工厂

entries 管理（message entries、toolStates、status、streaming entry id）是主会话和侧边栏**完全相同**的逻辑——只是 key 不同（主会话用 `sessionId`，侧边栏用 `artifactId`）。它必须保持为**纯工厂函数**：

```ts
export const createEntriesSlice: StateCreator<EntriesSlice, [], [], EntriesSlice> = (
  set,
  get,
) => ({ ... });
```

约束：

- 签名只接受 `EntriesSlice` 类型，**不得依赖任何其他 slice**
- 内部不调用 `get().somethingFromOtherSlice()`，所有数据自包含
- 不读取 `sessionStore` 等任何外部单例

两个 store 都通过 `...createEntriesSlice(...args)` 组合自己的副本。

### 3. 每个 slice 自包含

非 `entries-slice` 的 slice 可以 compose 多个其他 slice 提供的工具（如 `getEntryState`），但**不**直接 mutate 其他 slice 的内部 Map 字段。例如 `session-slice` 可以在 `removeSession` 里 `entryStates.delete(sessionId)`，但要在同一个 `set` 调用里完成。

### 4. 通过 key 而非嵌套结构隔离数据

- 主会话 entries：key 为 `sessionId`
- 侧边栏 entries：key 为 `artifactId`（即 IPC 中的 `sessionId`）

**不要**把侧边栏的 entries 嵌套进 `SideChatArtifactContent`——这正是导致旧版代码大量重复方法（`appendSideChatArtifactEntry` vs `appendMessageEntry`）的根因。新版保持扁平：所有 entries 都在 `Map<ownerId, EntryState>` 中。

### 5. 跨 slice 清理集中在 `set` 内

`removeSession`、`removeArtifact` 等清理操作必须在**同一个 `set` 调用**内删除所有相关 Map 条目，避免中间状态被其他订阅者观察到。

## 新增 store 的步骤

需要新增一个独立的运行时领域（例如 `file-viewer`、`terminal`、`code-exec`）时：

1. 在 `store/` 下创建新子目录，例如 `store/file-viewer/`
2. 在新子目录内创建 `index.ts`（`createStore` 入口）和 `slice.ts` 文件
3. 如果新领域有 entries/message 流，复用 `createEntriesSlice`：

   ```ts
   // store/file-viewer/index.ts
   import { createStore } from "zustand/vanilla";
   import { createEntriesSlice } from "../entries-slice";
   import { createFileViewerSlice } from "./file-viewer-slice";
   import type { FileViewerStoreState } from "../types";

   export const fileViewerStore = createStore<FileViewerStoreState>()((...args) => ({
     ...createEntriesSlice(...args),
     ...createFileViewerSlice(...args),
   }));
   ```

4. 在 `types.ts` 中新增 `FileViewerSlice` 接口和 `FileViewerStoreState` 组合类型
5. 消费者从独立路径导入：

   ```ts
   import { fileViewerStore } from "@renderer/store/file-viewer";
   ```

## 新增 slice 的规则

- 单一职责：每个 slice 管理一类状态，避免膨胀
- 用 `Map<id, T>` 而非嵌套对象存储 per-key 数据（参考 `permission-slice` 模式）
- 所有变更都走 `set` + `new Map(prev.map)` 保证不可变更新
- 提供 `removeXxx` 方法用于清理，对称于创建
- lazy default：`getXxx(id) ?? createDefault()`，避免在 Map 中预创建空记录

## 已知反模式（禁止）

| 反模式                                                     | 为什么禁止                                      |
| ---------------------------------------------------------- | ----------------------------------------------- |
| 在 `entries-slice` 之外用相同逻辑复制一份 entries 方法     | 重复代码，每次 schema 变动要改两处              |
| 把侧边栏特有状态塞进 `artifact-slice`                      | 越界，artifact-slice 应该只懂通用 artifact 记录 |
| 让不同领域的 slice 互相 `get().<other-slice>.<mutation>()` | 跨域隐式耦合，无法独立维护                      |
| 用单个全局 store 包含所有领域                              | 删除/清理变复杂，订阅粒度粗                     |

## 类型定义位置

`types.ts` 集中存放所有 slice 接口、组合 store 类型、可复用数据结构（如 `EntryState`、`SessionEntry`）。消费者只 import 类型时：

```ts
import { type SideChatMeta, type EntryState } from "@renderer/store"; // 类型 barrel
import { mainStore } from "@renderer/store/main"; // store 实例
```

类型 barrel **仅** re-export，不导出任何运行时 store 实例。这样可以避免循环依赖，也明确区分"仅用类型"和"实际订阅 store"两种使用方式。
