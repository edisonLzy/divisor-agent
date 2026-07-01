# Extension 系统

Extension 分为 main 与 renderer 两个入口。每个入口的 definition 都直接声明 `id`、`name` 与 `setup`，不再维护独立 manifest。

## 定义 Extension

```ts
export const EXAMPLE_EXTENSION = {
  id: "example",
  name: "Example",
} as const;
```

```ts
// main.ts
export default defineMainExtension({
  ...EXAMPLE_EXTENSION,
  setup(ctx) {
    ctx.systemPrompt.register({ id: "example.prompt", content: "..." });
    ctx.tools.register(tool);
  },
});
```

```tsx
// renderer.tsx
export default defineRendererExtension({
  ...EXAMPLE_EXTENSION,
  setup(ctx) {
    ctx.slashCommands.register(command);
    ctx.assistantBlocks.register(block);
    ctx.artifacts.register(artifact);
  },
});
```

主进程和渲染进程应展开同一个 metadata 常量，确保两端 id 一致。

## 类型安全 IPC

IPC contract 使用两个函数映射：InvokeEvents 描述 renderer 调用 main 的方法，OnEvents 描述 main 推送给 renderer 的事件。

```ts
interface InvokeEvents {
  getState(): State;
  updateState(state: State): void;
}

interface OnEvents {
  stateChanged(state: State): void;
}
```

Main 注册 handler 并发送事件：

```ts
export default defineMainExtension<InvokeEvents, OnEvents>({
  ...EXAMPLE_EXTENSION,
  setup(ctx) {
    ctx.ipc.handle("getState", () => state);
    ctx.ipc.handle("updateState", (nextState) => {
      state = nextState;
      ctx.ipc.emit("stateChanged", state);
    });
  },
});
```

Renderer 在模块级创建绑定 extension id 的 hook：

```tsx
const useExampleIPC = createUseExtensionIPC<InvokeEvents, OnEvents>(EXAMPLE_EXTENSION.id);

function Example() {
  const ipc = useExampleIPC();

  useEffect(() => {
    void ipc.invoke("getState").then(setState);
    return ipc.on("stateChanged", setState);
  }, [ipc]);
}
```

- `invoke` 的参数和返回值由 InvokeEvents 推导，返回值统一包装为 Promise。
- `handle` 支持同步或异步实现。
- `on` 返回 unsubscribe。
- IPC 在 Electron 内只使用固定的 `extension:invoke` 与 `extension:event` transport channel，实际方法按 extension id 隔离。
- 参数与返回值必须满足 Electron structured clone，不可传递函数或 Electron 实例。

## Main 上下文

```ts
setup(ctx) {
  const browserWindow = ctx.getBrowserWindow(); // BrowserWindow | null

  return ctx.agent.on("session_destroyed", ({ sessionId }) => {
    // 清理该主会话关联的资源
  });
}
```

- `getBrowserWindow()` 每次返回当前有效窗口，窗口不存在时返回 null，不应长期缓存返回值。
- `session_destroyed` 只对 `scope === "main"` 的 AgentPool 会话触发。
- side-chat、extension 自建 agent 和不存在的 session 不触发该事件。
- setup 可返回 disposer；应用退出时会和 IPC handler、agent listener 一起清理。

## 安装

Main 与 renderer 分别直接安装 definition：

```ts
export const installedMainExtensions = [exampleMain] satisfies AnyMainExtensionDefinition[];
export const installedRendererExtensions = [
  exampleRenderer,
] satisfies RendererExtensionDefinition[];
```

Extension 是 source-only workspace package。新增包时还需加入 app dependencies，并添加到 `electron.vite.config.ts` 的 `externalizeDeps.exclude`。
