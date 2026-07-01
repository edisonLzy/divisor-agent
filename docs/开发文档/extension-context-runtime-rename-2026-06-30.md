# Extension 上下文 `agentRuntime` → `extensionRuntime` 重命名

## 背景

`MainExtensionContextValues` 在 extension-core 的 `bridge.ts` 里持有 main 进程启动 extension 所需的两个外部依赖：`getBrowserWindow` 与「主进程 agent 运行时服务」。

之前这个运行时服务字段叫 `agentRuntime`：

```ts
export interface MainExtensionContextValues<
  TAgentRuntime extends MainExtensionRuntimeAPI = MainExtensionRuntimeAPI,
> {
  getBrowserWindow(): BrowserWindow | null;
  agentRuntime: TAgentRuntime;
}
```

命名有两个问题：

1. **和 setup 上下文里的 `ctx.runtime` 重名。** `MainExtensionContext`（extension 拿到的那个 `ctx`）已经把 agent 运行时暴露成 `ctx.runtime: MainExtensionRuntimeAPI`，外面的 contextValues 字段也叫 `agentRuntime`，两个语义完全不同的对象靠大小写区分,阅读时容易混淆到底是哪一个。
2. **泛型参数 `TAgentRuntime` 不再带来价值。** `ExtensionService` 是 `MainExtensionContextValues` 的唯一具体实现者，泛型是「为了未来可能多形态运行时」而保留的——但目前 app 包里只有 `ExtensionRuntimeService` 一种实现，没有第二个候选类型参数。`extension-core` 不应该替 `app` 持有这个不确定性。

## 改动

### 1. `bridge.ts` —— 字段重命名,移除泛型

```ts
export interface MainExtensionContextValues {
  getBrowserWindow(): BrowserWindow | null;
  extensionRuntime: MainExtensionRuntimeAPI;
}
```

`bridge` 内部读 `this.contextValues.extensionRuntime` 写进 setup ctx 的 `runtime` 字段,语义不变。

### 2. `extension-service.ts` —— 构造器签名重排

`ExtensionService extends MainExtensionBridge` 之前接收整个 `MainExtensionContextValues`,并把 `contextValues.agentRuntime` 存为 `this.runtimeService`。现在字段名变了,且 `ExtensionService` 自己已经在构造时做了 `runtimeService.setExtensionService(this)`,没有必要再让调用方传一个完整 contextValues。

新签名:

```ts
constructor(
  runtimeService: ExtensionRuntimeService,
  getBrowserWindow: () => BrowserWindow | null,
) {
  super(installedMainExtensions, {
    extensionRuntime: runtimeService,
    getBrowserWindow,
  });
  this.runtimeService = runtimeService;
  runtimeService.setExtensionService(this);
  this.initialize();
}
```

`setExtensionService` 这一行从 `AgentPool` 搬进了 `ExtensionService` 构造器,消除了之前需要外部协调「先 new 完再 setExtensionService」的两步序列。

### 3. `agent-pool.ts` —— 构造调用同步收紧

```ts
this.extensionService = new ExtensionService(
  this.extensionRuntimeService,
  () => this.currentBrowserWindow,
);
```

少了一个 `agentRuntime: ...` 字段、少了一次外部 `setExtensionService` 调用,两行变三行但语义更内聚。

### 4. `extension-core.test.ts` —— 测试 mock 跟上

`MainExtensionContextValues` 是测试文件直接构造的类型,字段重命名要求:

- `createContextValues()` 里的 `agentRuntime` 改回 `extensionRuntime`。
- `getBrowserWindow` mock 现在必须满足 `() => BrowserWindow | null`,但 mock 只 stub 了 `isDestroyed` 和 `webContents.{isDestroyed,send}`,不是完整的 `BrowserWindow` 实例。用 `as unknown as BrowserWindow` 显式表达「这是结构性 mock,不是真的 BrowserWindow」,并 import `type { BrowserWindow } from "electron"` 作为 cast 锚点。

## 为什么是 `extensionRuntime` 而不是保留 `agentRuntime`

- **与 `ctx.runtime` 形成 mirror。** `MainExtensionContext` 把运行时叫 `runtime`,对应的 contextValues 字段叫 `extensionRuntime`(强调「它驱动 extension bridge」)。如果保留 `agentRuntime`,在 `bridge.ts` 内部就会同时出现 `contextValues.agentRuntime` 和 `ctx.runtime`,含义相同但名字不同。
- **不丢「extension 入口」语义。** `runtime` 太宽(可能跟未来别的 runtime 撞名),`agentRuntime` 又太窄(实际并不只跟 agent 有关,`ExtensionRuntimeService` 还承担 `setExtensionService`、系统 prompt 注入等 extension-side 协调职责)。`extensionRuntime` 在「它是 extension bridge 用的 runtime」这层语义上最准确。

## 不变项

- `MainExtensionContext.runtime`(extension setup 拿到的 `ctx.runtime`)字段名、类型、来源都不变。
- `ExtensionService` 对外暴露的方法、继承层级、初始化时机(构造器末尾 `this.initialize()`)都不变。
- `MainExtensionRuntimeAPI` 接口本身不变。
- Extension 实际编写者不感知这次改动——`ctx.runtime` 一直是公开 API,`contextValues` 字段是 bridge 内部使用。

## 后续可清理

- 如果 `ExtensionService` 的构造器再瘦,可以考虑把 `(runtimeService, getBrowserWindow)` 还原成一个 options 对象——但目前参数只有两个,内联更直接,等出现第三个参数再换不迟。
