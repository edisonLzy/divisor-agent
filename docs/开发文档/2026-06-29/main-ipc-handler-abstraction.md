# Main 进程 IPC Handler 抽象与拆分

## 背景

之前 `packages/app/src/main/agent-ipc.ts` 把 Extension IPC、AgentPool IPC、文件系统 IPC（`fsReadTextFile`）和窗口 IPC（`isWindowFullScreen`）的注册逻辑全部集中在一个 `registerIPCHandlers` 函数里，由 `index.ts` 在启动时一次性绑定。

这种集中式实现有两个问题：

1. **职责过载。** `agent-ipc.ts` 同时管 AgentPool 的所有 channel、`fsReadTextFile`、`isWindowFullScreen`、Extension IPC 解析、Emittery 事件转发——文件已经承担了「IPC 框架 + 三种业务模块」的多重职责。
2. **难以扩展。** 每加一类需要在 main 进程向 renderer 推送事件的 main-process 服务（例如 file system、window state、未来的 system info），都要在 `registerIPCHandlers` 里手动追加 channel 注册和事件转发，无法独立订阅生命周期。

新的实现把这些职责拆开：

- `AbstractAgentIPCHandler<IPC>`：通用基类，负责 `ipcMain.handle` 注册、反注册、当前窗口引用、`sendMessageToRenderer`、`updateBrowserWindow`。
- `AgentPool` / `FileSystemManager` / `BrowserWindowManager`：各自实现一份 `bind()`，只声明自己负责的 channel。
- `bindAgentRuntimeIPC` 只保留 Extension IPC 桥（由 extensionId/method 动态分发，不能归到上述静态基类）。

## 为什么把 `bind()` 设计成 protected abstract

- **模板方法模式。** 每个具体 handler 自己知道要注册哪些 channel；基类不关心。`bind()` 返回一个 `VoidFunction` 用于 unbind，由基类保存为 `this.unbind`，构造器末尾统一调用，使「业务状态就绪后再注册 channel」的不变量由基类强制保证。
- **避免双重继承。** `AgentPool` 同时需要 `Emittery<AllowedMainExposeEvents>`（事件转发）和 IPC handler 能力，TypeScript 只能单继承，所以改为基类 + 内部 `private events = new Emittery(...)` 的组合方式。事件通过 `this.events.emit` / `this.events.onAny` 转发，避免 `super.emit` 与 `this.emit` 混淆。

## BrowserWindow 引用如何传递

- 基类持有 `private browserWindow`，通过 `currentBrowserWindow` getter 暴露；`updateBrowserWindow` 在 `activate` 时由 `index.ts` 调用。
- `AgentPool` 进一步把 `() => this.currentBrowserWindow` 传给 `ExtensionService` 的 `getBrowserWindow` 选项——和之前 `AgentPoolOptions.getBrowserWindow` 的语义一致，但少了一个间接层（不用再在 `index.ts` 维护 `getBrowserWindow` 闭包）。

## 测试更新

`agent-pool.test.ts` 里 `new AgentPool(() => null)` 改为 `new AgentPool({} as never)`，反映构造器从 `AgentPoolOptions` 改为直接收 `BrowserWindow` 实例。同时新增了 `vi.mock("electron", ...)` 局部 mock 兜底 `ipcMain.handle / removeHandler`，避免真实依赖 Electron 运行时。

## 不变项

- 公共 IPC channel 列表不变；renderer 端不需要任何改动。
- `bindAgentRuntimeIPC(agentPool)` 的签名从接收 `getBrowserWindow` getter 变为不传（AgentPool 内部已持有窗口引用），调用方由 `index.ts` 唯一持有，没有外部调用者。
- Extension IPC 解析逻辑（`parseExtensionIPCRequest`）未变。
