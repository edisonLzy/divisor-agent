# 应用更新：重命名 + 内联状态条 — 2026-07-03

## Why

上一版 `feat: add automated releases and app updates`（98f2f13）把整套自更新机制引入到了 app 主进程：

- 主进程侧：`packages/app/src/main/updater/index.ts` 导出 `UpdateManager`，通过 `electron-updater` 接管 `idle → checking → available → downloading → downloaded → error` 状态机，并通过 `update_state` 主→渲染事件广播当前状态。
- 类型契约：`packages/app/src/shared/update-ipc.ts` 定义 `UpdateState` / `UpdateIPC`。
- 渲染侧：`packages/app/src/renderer/App.tsx` 内嵌一个 `UpdateDialog`（基于 shadcn `Dialog` 全局模态），在 `available` 时弹窗，用户手动「下载并安装」。

跑通流程之后立刻遇到三件事，让原方案变得不可持续：

1. **命名空间歧义。** `updater/`、`update-ipc.ts`、`update_state` 这些标识符都是泛指词，掩盖了它们真正承载的是「app 自更新」这件事 —— 之后如果引入 agent / 模型 / 依赖等其他更新通道（例如 agent skill 热更新、模型权重下发），名字会撞车。把所有 app 自更新相关的符号统一加上 `app-` 前缀，把命名空间留给以后复用。
2. **模态弹窗打扰主流程。** 全局 `Dialog` 在用户正在写 prompt / 等工具返回时弹出「下载并安装」，会直接抢焦点、阻挡操作，且 `downloading` / `downloaded` 状态都锁住 `onOpenChange`（`if (!isInstalling) setOpen(nextOpen)`），意味着用户必须等下载完才能关闭。在 chat 场景里，下载是个 1–10 MB 的后台动作，不该打断主任务。
3. **状态条可观测性。** 模态弹窗让用户只能看到「下载完成 / 失败」，看不到「正在下载 35%」这种实时进度条。新方案改成一个常驻的轻量卡片，能展示进度且不打断聊天。

## How

### 1. 重命名（保留 blame）

| 旧                                  | 新                                       | 类型     |
| ----------------------------------- | ---------------------------------------- | -------- |
| `updater/index.ts`                  | `app-updater.ts`                         | 文件     |
| `UpdateManager`                     | `AppUpdateManager`                       | 类       |
| `update-ipc.ts`                     | `app-update-ipc.ts`                      | 文件     |
| `UpdateState` / `UpdateIPC`         | `AppUpdateState` / `AppUpdateIPC`        | 类型     |
| `UpdateEvent`                       | `AppUpdateEvent`（带 `type: "app_update"`） | 类型   |
| `update_state`（main → renderer）   | `app_update`                             | IPC 事件 |
| `update-manager.test.ts`            | `app-updater.test.ts`                    | 测试文件 |

文件重命名走 `git mv`（或 IDE rename，git 把它识别为 `R090` 重命名），保留每一行的作者信息。

### 2. 渲染侧 UI：删除模态，改成内联状态条

- **删除**：`packages/app/src/renderer/components/app-update-dialog.tsx`、`App.tsx` 里内嵌的 `UpdateDialog` 函数，以及用到的 `Alert` / `Dialog` / `ProgressLabel` / `ProgressValue` 等组件引用。
- **新增**：`packages/app/src/renderer/pages/workspace/sessions/app-update.tsx`，导出 `<AppUpdate />`，挂在 `BottomActions` 顶部（`packages/app/src/renderer/pages/workspace/sessions/bottom-actions.tsx`）。
- 卡片表现：
  - 没有可用更新时整张卡片 `AnimatePresence` 退场，BottomActions 只剩「设置」按钮。
  - `available` 显示「新版本 X.Y.Z / 可在后台下载」+ 稍后 / 下载 两个按钮。
  - `downloading` 在卡片底部贴一根 1px 进度条（`Progress` + cyan indicator），不打断聊天。
  - `downloaded` 提示「更新已准备好 / 现在重启或退出时安装」，用户可「稍后」（保留到下一次退应用时安装 —— 由 `autoUpdater.autoInstallOnAppQuit = true` 保证）。
  - `error` 提供「关闭 / 重试」。

### 3. IPC 契约扩展

`packages/app/src/shared/events-ipc.ts`：

- `ALLOWED_MAIN_EXPOSE_EVENTS` 把 `"update_state"` 换成 `"app_update"`。
- `AgentRuntimeEvent` 联合类型新增 `AppUpdateEvent`。
- `ALLOWED_RENDER_INVOKE_EVENTS` 新增 `getUpdateState / checkForUpdates / startUpdate / installUpdate` 四个 invoke —— 之前没有 `getUpdateState`，渲染端无法在挂载时拿当前状态回放；现在通过 `useEffect(() => invoke("getUpdateState"), [invoke])` 补齐。
- `AgentRuntimeIPC` 通过交集 `&` 自动把 `AppUpdateIPC` 接入主进程的 IPC handler 接口，`AppUpdateManager extends AbstractAgentIPCHandler<AppUpdateIPC>` 已经实现了这四个方法，零额外接线。

### 4. 主进程侧的事件发送调整

`AppUpdateManager.setState` 现在统一走 `sendMessageToRenderer("app_update", { ...state, type: "app_update" })`，把类型断言下沉到 `AppUpdateIPC` 的 union 上 —— 渲染端的 `useSubscribeAgentEvents({ app_update: ... })` 直接拿到强类型 `AppUpdateEvent`，不再需要本地再 `as` 一遍。

### 5. 原型参考

`docs/原型/app-update-lifecycle-prototype.html` 是这次的状态机 + UI 走查原型：列出了 6 个状态（idle / checking / available / downloading / downloaded / error）的文案、配色、按钮组合，对应 `<AppUpdate />` 里 `getAppUpdateContent(state, isDeferred)` 的输出。改文案或调色前先看这里。

## 影响面

- 渲染端不再有「下载时弹窗抢焦点」的问题。
- 命名空间统一为 `app-*` —— 之后 agent / 模型等其他更新通道可以另起 `agent-update-ipc.ts`、`model-update-ipc.ts` 而不撞名。
- IPC 通道 `app_update` 比之前的 `update_state` 更明确通道归属，preload 桥的 `ALLOWED_MAIN_EXPOSE_EVENTS` 白名单是单一来源。

## 验证

- `pnpm --filter @divisor-agent/app type-check`
- `pnpm --filter @divisor-agent/app test -- app-updater.test.ts`
- 手动（packaged build）：冷启动 → 等待 2s 后的自动 check → 卡片从无到有 fade in → 点「下载」→ 底部进度条动 → 完成后变成「立即重启」/「稍后」。