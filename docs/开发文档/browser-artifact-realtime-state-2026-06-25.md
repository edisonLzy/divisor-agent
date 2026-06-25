# Browser Artifact · 实时状态同步 & 布局响应 · 2026-06-25

## Why

browser-artifact 的首批落地（`browser-artifact-2026-06-25.md`）只解决了"页面怎么嵌入主窗口"和"annotation 怎么形成回路"两个核心问题，但还有两个体感非常明显的 UX 缺陷：

**Bug 1 — 刷新后永远 "加载中"**

`BrowserManager` 在主进程维护 `record.state`，但这个 state 只在 `invoke()` 的返回值里出来一次：刷新 / 跳转 / 后退 / 前进 / annotation 截图等动作触发后，`invoke()` 同步返回的是**调用瞬间**的状态（`status: "loading"`），等主进程后续触发 `did-stop-loading` / `did-navigate` / `did-fail-load` / `page-title-updated` 真正完成加载时，主进程的 state 已经走到 `"ready"` / `"error"` / `"blocked"`，但渲染端的本地 `browserState` 仍然卡在 `"loading"`——地址栏指示灯一直亮黄、status 文案永远显示"加载中"。

根因：`BrowserManager` 没有走 Emittery / `onAny` 事件链路，`agent-ipc.ts` 只对 `agentPool.onAny` 做了 forward；主进程到渲染端的浏览器状态推送链路根本不存在。

**Bug 2 — 切页面 / 拖侧栏后 WebContentsView 位置错乱**

`BrowserArtifact` 通过 `ResizeObserver(stage)` + `window resize` 来更新 bounds，但 `ResizeObserver` 只在**观察元素自身的 box 尺寸**变化时触发，不在位置变化时触发。实际触发"位置变化、尺寸不变"的场景包括：

- 切换 artifact tab：旧 artifact 的 stage 卸载，新 artifact 的 stage mount——但 mount 时机与 `setBounds` 之间存在异步竞态；
- 切走 / 切回 artifact 面板（toggle）：兄弟面板用 `transition-[flex-grow] duration-200` 做动画，期间 stage 位置每帧都在变；
- 拖侧栏 / resize 主窗口：父级 resizable panel 调整，stage 跟着移动；
- annotation 模式下 `mode !== "browse"`：`browserSetVisible(false)` 把 view 折叠成 `0×0`，等切回 browse 模式后 view 已经丢失旧 bounds。

结果：WebContentsView 还停在旧坐标，渲染端 layout 已经挪到新位置 → 出现"画面叠在 chat 文本上"、"内容被裁掉一半"、"刷新按钮亮黄但实际页面早就 ready"等错乱。

## How

### 1. 补齐 main → renderer 的浏览器状态推送

把 `BrowserManager` 改成 Emittery：

```ts
// packages/app/src/main/browser-manager.ts
interface BrowserManagerEvents {
  browser_state_changed: BrowserStateChangedEvent;
}
export class BrowserManager extends Emittery<BrowserManagerEvents> { ... }

private updateState(record, patch) {
  record.state = { ... };
  void this.emit("browser_state_changed", {
    ...record.state,
    artifactId: record.artifactId,
    sessionId: record.sessionId,
    type: "browser_state_changed",
  });
  return record.state;
}
```

`BrowserStateChangedEvent` 在 `shared/browser-artifact-ipc.ts` 上加了 `sessionId` 字段（原本只有 `artifactId`），用于在多 session 并存时路由到正确的 artifact tab：

```ts
export interface BrowserStateChangedEvent extends BrowserState {
  artifactId: string;
  sessionId: string;       // 新增：让 main → renderer 的事件可以路由到对应 session
  type: "browser_state_changed";
}
```

事件本身（`did-start-loading` / `did-stop-loading` / `did-navigate` / `did-fail-load` / `page-title-updated` / `will-navigate` / `goBack` / `goForward`）在 `BrowserManager.configureWebContents` 里早就注册齐了，所以只要在 `updateState` 里 emit 一次，外层所有触发器都会自动推送。

`events-ipc.ts` 把 `browser_state_changed` 加入允许列表：

```ts
type AgentRuntimeEvent = AgentEvent | PermissionRequestedEvent | BrowserStateChangedEvent;
export const ALLOWED_MAIN_EXPOSE_EVENTS: AgentRuntimeEvent["type"][] = [
  ...,
  "browser_state_changed",
];
```

注意：`SessionTagged<T>` 给每个事件自动加 `scope: AgentSessionScope` 字段，浏览器事件的 `scope` 在 `agent-ipc.ts` 的 `onAny` forward 时不会带——这是有意的：浏览器事件跟 main / side-chat 没关系，只是单纯的 main-side artifact，直接透传给渲染端、由渲染端用 `sessionId + artifactId` 双重过滤。

### 2. `agent-ipc.ts` 桥接 BrowserManager 事件到 webContents

之前 `bindAgentRuntimeIPC` 的写法是：

```ts
const unregisterAgentRuntimeHandlers = registerAgentRuntimeHandlers(agentPool, browserWindow);
const unregisterIPCHandlers = registerIPCHandlers(agentPool, browserWindow);
```

两个函数分别 `new BrowserManager()`，导致事件 forward 链路和 IPC handler 链路拿到的是**两个独立的 BrowserManager**——事件永远不会到达渲染端。

改成单一 BrowserManager 实例：

```ts
const typedIpcMain = createTypedIpcMain();
const browserManager = new BrowserManager(browserWindow);
const unregisterAgentRuntimeHandlers = registerAgentRuntimeHandlers(agentPool, browserManager, browserWindow);
const unregisterIPCHandlers = registerIPCHandlersWithManager(agentPool, browserManager, browserWindow, typedIpcMain);
```

`registerAgentRuntimeHandlers` 同时挂 `agentPool.onAny` 和 `browserManager.onAny`：

```ts
const offBrowserAny = browserManager.onAny(({ name, data }) => {
  if (browserWindow.isDestroyed() || typeof name !== "string") return;
  browserWindow.webContents.send(name, data);
});
```

顺手把原来内联的 `registerIPCHandlers` 函数拆成 `registerIPCHandlersWithManager(..., typedIpcMain)`，避免重复 `new BrowserManager`。

### 3. 渲染端订阅 `browser_state_changed`

`BrowserArtifact` 通过 `useElectronIPC().on("browser_state_changed", ...)` 订阅：

```ts
useEffect(() => {
  const off = on("browser_state_changed", (event: BrowserStateChangedEvent) => {
    if (event.sessionId !== sessionId || event.artifactId !== artifactId) return;
    setBrowserState({
      canGoBack: event.canGoBack,
      canGoForward: event.canGoForward,
      status: event.status,
      title: event.title,
      url: event.url,
    });
    setAddress((current) => (current === event.url ? current : event.url));
  });
  return off;
}, [artifactId, on, sessionId]);
```

`invoke()` 仍然负责"开始一次操作"，`on()` 负责"接收异步状态变化"——这是同步乐观更新 + 异步事件校正的双链路模式，刷新按钮再也不会卡 loading。

### 4. 让 bounds 跟得上所有 layout 变化

旧的 `useLayoutEffect`：

```ts
const ro = new ResizeObserver(updateBounds);
ro.observe(stage);
window.addEventListener("resize", updateBounds);
```

只覆盖了"stage 自己 resize"和"window resize"两种情况。新版引入三件事：

**(a) rAF coalescing** — ResizeObserver 在一次 layout shift 里会连续 fire 多次（多个 frame），如果每次都同步 IPC 到主进程会出现"还没等动画结束就发了 N 次 setBounds"。把更新包到 `requestAnimationFrame` 里，一帧只发一次：

```ts
let frame = 0;
const scheduleUpdateBounds = () => {
  if (frame !== 0) return;
  frame = requestAnimationFrame(updateBounds);
};
```

**(b) 监听 offsetParent 链** — `ResizeObserver` 不监听"位置变化"，所以 stage 自己尺寸不变、但被父级重排时不会触发。把 stage 沿 `offsetParent` 链一路 observe 到 `document.body`：

```ts
const observedElements: Element[] = [stage];
let parent = stage.offsetParent as HTMLElement | null;
while (parent && parent !== document.body) {
  observedElements.push(parent);
  parent = parent.offsetParent as HTMLElement | null;
}
for (const el of observedElements) resizeObserver.observe(el);
```

这样切 artifact tab（兄弟 panel 动画）、toggle artifact panel（兄弟 panel flex 动画）、拖侧栏（父级 resizable panel 调整）都会触发 `updateBounds`。

**(c) scroll 监听** — 极少数情况下 stage 可能因为父级 scroll 改变位置（虽然当前 layout 没有这种场景，但加上成本极低），加个 `window scroll` 兜底。

cleanup 阶段除了 disconnect ResizeObserver，还要 `cancelAnimationFrame` 取消未触发的 frame，避免卸载后还往 IPC 队列塞请求。

### 5. 已经存在的 `use-agent-messages.ts` 修改

为了让 `message_start` 事件对 `toolResult` 角色也走到 `isAgentAssistantMessage` 守卫之后被 early-return（不让 tool result 占一行空 entry），加了：

```ts
if (!isAgentAssistantMessage(message)) return;
```

这跟浏览器状态无关，是修一个相邻的 UI bug（tool call 留下空行），跟本次浏览器问题一起提交。

## 影响范围

| 文件                                              | 改动                                                        |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `shared/browser-artifact-ipc.ts`                  | `BrowserStateChangedEvent` 加 `sessionId`                    |
| `shared/events-ipc.ts`                            | `AgentRuntimeEvent` / `ALLOWED_MAIN_EXPOSE_EVENTS` 加 `browser_state_changed` |
| `main/browser-manager.ts`                         | `extends Emittery`；`updateState` 末尾 emit `browser_state_changed` |
| `main/agent-ipc.ts`                               | 单一 `BrowserManager` 实例；`registerAgentRuntimeHandlers` 增 `browserManager.onAny` forward；拆出 `registerIPCHandlersWithManager` |
| `renderer/.../browser-artifact/index.tsx`         | 订阅 `browser_state_changed`；bounds 计算加 rAF coalesce + offsetParent 链 + scroll |
| `renderer/.../use-agent-messages.ts`              | `message_start` 加 `isAgentAssistantMessage` 守卫（顺手修 tool result 占空行） |

## 风险与后续

- **`emit` 调用频率**：`did-start-loading` / `did-stop-loading` / `did-navigate` / `did-fail-load` / `page-title-updated` 都各自触发一次 `updateState`，每次都会 emit。正常一次刷新会发 2~3 个事件（start → stop / navigate → title-updated），可以接受；如果以后发现某些场景刷一次发了 10+ 个，可以考虑在 `updateState` 里做 state diff，只在状态真的有变化时 emit（去抖）。
- **offsetParent 链遍历**：当前最多遍历到 `<body>`，对 workspace layout 是 O(5) 级别；未来如果把 stage 嵌到多层 shadow DOM / iframe 里需要重新审视。
- **跨 session 路由**：现在用 `sessionId + artifactId` 双重过滤，理论上足够；但 `BrowserManager` 内部已经有 `records` map 是按 `sessionId:artifactId` 索引的，可以在 emit 时直接 `records.get(key)` 取 record，把 emit 收口在 record 边界，避免每个事件都全量广播再过滤。
- **测试覆盖**：browser-manager 目前没有单测，bug 1 的回归测试可以加一个"reload 后状态应该转 ready"的断言；bug 2 的 layout 响应测试比较难写（依赖真实 DOM），靠手动验证。

## 验证

```bash
pnpm type-check        # 通过
pnpm lint              # 0 errors（5 个 pre-existing warnings，与本改动无关）
pnpm test              # 69 passed；15 failed 全部是 ModelRegistry / AgentRuntime 的
                       # pre-existing 失败（git stash 后跑仍然失败），与本改动无关
```

手动验证步骤：

1. 启动 app（`pnpm dev:app`），打开任意 browser artifact；
2. 点击刷新按钮 → 状态指示灯应在 1s 内从黄（loading）切到绿（ready），status 文案从"加载中"切到"页面就绪"；
3. 拖侧栏 resize → WebContentsView 应跟随缩放，位置正确；
4. toggle artifact 面板开 / 关 → 再次开时 WebContentsView 应在正确位置（不再有"画面留在关闭前位置"）；
5. 切换 artifact tab → 新 tab 加载完后状态正确转 ready，不卡 loading。