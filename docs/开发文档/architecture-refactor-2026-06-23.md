# 架构 refactor:系统 IPC 拆分、Hook 抽取、Side-chat 模型透传

> 日期:2026-06-23
> 范围:`packages/app/src/{shared,main,renderer}` 共 11 个文件
> 影响:Electron 主进程 ↔ Renderer IPC 通道重新组织;Renderer 内 Hook / Store / UI 三层小重构;无协议级破坏性变更(API 形态不变)

## 一、背景(Why)

`refactor/architecture-upgrade` 分支累积了几个不相关的局部重构:

1. **`isWindowFullScreen` 这条 IPC 通道放在 `agent-ipc.ts` 里,但它和 agent 没关系**——它只是查询 BrowserWindow 全屏状态,跟 model、session、permission、skill 全不沾边。混在一起,`AgentRuntimeIPC` 这个 type union 越来越臃肿,后人加新通道倾向于往 `agent-ipc.ts` 堆。
2. **chat 页面里"窗口全屏状态 + 边栏折叠状态"两个独立信号散落**。`chat/index.tsx` 同时给两个子组件传 `isSidebarCollapsed`,子组件各自再算 `insetForWindowControls`。逻辑分散,且 `useEffect` 的事件监听散在页面里不好复用。
3. **side-chat 的模型选择**——`SideChatMeta.model` 是 `Pick<AvailableModel, "modelId" | "providerId">`,只存 id;`PromptInput` 的 `useModalSelector` 永远以 `null` 初始化。所以每次重开 side-chat artifact,模型选择器都会"忘记"上次选的,体验差。
4. **`getEntryState` 的 hot path 缺陷**——找不到 session 时返回 `{ ...EMPTY_ENTRY_STATE, toolStates: new Map() }`,**每次新建 Map**。`useStore(state => state.entryStates.get(sessionId) ?? fallback)` 的 selector 每次拿到不同引用,触发重渲染。

这四个改动刚好凑成一个 commit,核心都是"把分散的、同名的、不相关的概念分离到正确的层"。

## 二、核心决策(Why,重点)

### 2.1 拆分 `system-ipc.ts`:按"职责"而不是按"模块"组织 IPC

旧结构里所有 renderer→main invoke 都汇到 `agent-ipc.ts`:

```ts
// 旧:agent-ipc.ts(被改名 events-ipc.ts,但 channel 注册仍混在一起)
typedIpcMain.handle("setModel", agentPool.setModel);
typedIpcMain.handle("prompt", agentPool.prompt);
typedIpcMain.handle("isWindowFullScreen", async () => browserWindow.isFullScreen()); // ← 不属于 agent
```

新结构按"这条通道的本质职责"分组到独立 interface:

| Interface | 文件 | 含义 |
| --- | --- | --- |
| `AgentSessionIPC` | `session-ipc.ts` | 跟 agent session 生命周期相关 |
| `AgentModelsIPC` | `models-ipc.ts` | 模型配置 / registry |
| `AgentSkillsIPC` | `skills-ipc.ts` | skill 列表与启用 |
| `FileSystemIPC` | `file-system-ipc.ts` | fs read / write |
| **`SystemIPC`** | **`system-ipc.ts`(新)** | **系统级查询,跟 agent 无关** |

`SystemIPC` 现在只装一条:

```ts
// packages/app/src/shared/system-ipc.ts
export interface SystemIPC {
  isWindowFullScreen(): Promise<boolean>;
}
```

`AgentRuntimeIPC` 用 type intersection 拼起来:

```ts
// packages/app/src/shared/events-ipc.ts
export type AgentRuntimeIPC =
  AgentModelsIPC & AgentSessionIPC & AgentSkillsIPC & FileSystemIPC & SystemIPC;
```

**为什么用 intersection 而不是新增一个 union 分支**:本来 `AgentRuntimeIPC = A | B | C | D | E` 也行,但 `events-ipc.ts` 已经用 `keyof AgentRuntimeIPC` 推 `ALLOWED_RENDER_INVOKE_EVENTS` 白名单,intersection 形式能保证"加一条 system 级通道 = 加一个 interface 文件 + 在 intersection 里加一行 + 在白名单里加一个名字",三处都是编译期检查的。新加通道漏掉白名单会直接 TS error。

**新增系统级 IPC 时的扩展规则**(给未来):

1. 在 `shared/<area>-ipc.ts` 写 interface(比如 `window-controls-ipc.ts`)
2. 在 `events-ipc.ts` 的 `AgentRuntimeIPC` intersection 里加上
3. 在 `ALLOWED_RENDER_INVOKE_EVENTS` 里加通道名
4. 在 `main/agent-ipc.ts` 的 `createTypedIpcMain` 注册 handler
5. 渲染端用 `useElectronIPC().invoke("...")`

### 2.2 抽取 `useWindowFullScreen`:把"窗口状态订阅"从 chat 页面解耦

`chat/index.tsx` 原本 inline 了一段 resize/focus 监听 + IPC poll。提到 `pages/workspace/use-window-full-screen.ts`:

```ts
export function useWindowFullScreen() {
  const { invoke } = useElectronIPC();
  const [isWindowFullScreen, setIsWindowFullScreen] = useState(false);

  const syncWindowFullScreen = useCallback(async () => {
    try {
      setIsWindowFullScreen(await invoke("isWindowFullScreen"));
    } catch (error) {
      console.error("Failed to read window fullscreen state", error);
    }
  }, [invoke]);

  useEffect(() => {
    void syncWindowFullScreen();
    window.addEventListener("resize", syncWindowFullScreen);
    window.addEventListener("focus", syncWindowFullScreen);
    return () => {
      window.removeEventListener("resize", syncWindowFullScreen);
      window.removeEventListener("focus", syncWindowFullScreen);
    };
  }, [syncWindowFullScreen]);

  return isWindowFullScreen;
}
```

注意几个设计选择:

- **`resize` + `focus` 双事件**:macOS 全屏切换时 `resize` 不一定触发(标题栏被隐藏),但 window 失焦/聚焦切换会带 focus 事件,所以两者都听。
- **try/catch 包 IPC 调用**:主进程窗口销毁后 IPC 会 reject,不能让 hook 抛。
- **返回 boolean 而不是 `{ isFullScreen }`**:遵循 [[Prefer explicit over clever]]——一个 hook 就一个语义信号,不要套壳对象。

页面侧把派生布尔算出来再下传:

```ts
// chat/index.tsx
const isWindowFullScreen = useWindowFullScreen();
const insetForWindowControls = isSidebarCollapsed && !isWindowFullScreen;
```

命名上刻意从 `isSidebarCollapsed` 改成 `insetForWindowControls`(语义:这个子组件是否需要为 macOS 红绿灯留出 64px 左边距)。子组件不再"自己算逻辑",只决定"如果是则加 padding"。

### 2.3 Side-chat 模型透传:`Pick<>` 换成完整 `AvailableModel`

旧 `SideChatMeta.model` 只存 id:

```ts
// 旧:side-chat-slice.ts
model?: Pick<AvailableModel, "modelId" | "providerId">;
```

用户每次开 side-chat artifact → `useModalSelector()` 永远以 `null` 初始化 → 第一次弹模型选择器总是 default model。这是**典型的"持久化层只存了够用的最小子集,但 UI 层需要完整对象"**的反模式——选了等于没选。

新的:

```ts
model?: AvailableModel;  // 完整对象,带 provider info / label / capabilities
```

`SideChatArtifact.submitPrompt` 在 invoke 之前把 `submission.model` 写回 store:

```ts
sideChatStore.getState().setSideChatModel(artifact.id, submission.model);
```

`PromptInput` 增加 `initialModel?: AvailableModel | null` prop,转给 `useModalSelector(initialModel)`(后者签名本来就支持 initialValue,只是之前没接上)。

**为什么不在 `appendSideChatMeta` 时就要求 model 必填**:side-chat artifact 由用户在主对话里"highlight 一段文字"触发,创建时还没有 model 选择。第一次提交时才有。所以是 lazy。

### 2.4 `getEntryState` 返回共享常量,而不是 fresh Map

旧:

```ts
getEntryState: (sessionId) => {
  const existing = get().entryStates.get(sessionId);
  if (existing) return existing;
  return { ...EMPTY_ENTRY_STATE, toolStates: new Map() };  // ← 每次新建 Map
},
```

新:

```ts
getEntryState: (sessionId) => {
  const existing = get().entryStates.get(sessionId);
  if (existing) return existing;
  return EMPTY_ENTRY_STATE;  // ← 共享引用
},
```

如果不存在 session,任何调用方都会拿到同一个对象引用。**但**这意味着调用方必须只读地使用,不能 mutate。

下游用 `getEntryState` 的地方都走 `set((prev) => { ... })`,自己复制 Map,所以 shared reference 是安全的。`EMPTY_ENTRY_STATE.toolStates` 这个 Map 永远不应该被外部 mutate——已写入 setter 的所有路径都用了 `new Map(prev.entryStates)` + `new Map(current.toolStates)` 的 immutable 模式。

### 2.5 `CollapsibleContent` 高度控制权交回 caller

旧:

```tsx
<CollapsiblePrimitive.Panel className="...overflow-hidden...">
  <div className={cn("h-(--collapsible-panel-height)", className)}>{children}</div>
</CollapsiblePrimitive.Panel>
```

问题:`className` 被塞到内层 `<div>`,而且内层强制 `h-...` 高度——caller 想"内容自己决定高度"(比如高度自适应内容)时被覆盖。

新:

```tsx
<CollapsiblePrimitive.Panel className={cn("...overflow-hidden...", className)}>
  <div className="min-h-0">{children}</div>
</CollapsiblePrimitive.Panel>
```

`className` 直接挂到 Panel 上,内层只放 `min-h-0`(flex 容器场景需要)。改完 `PendingSessionContent` / `ActiveSessionContent` 不需要改调用方,语义对齐 Radix Collapsible 的标准用法。

### 2.6 边栏折叠动画

`workspace/index.tsx` 给 ResizablePanelGroup 的子 panel 加 Tailwind 过渡类:

```tsx
<ResizablePanelGroup
  orientation="horizontal"
  className="flex-1 *:data-panel:transition-[flex-grow] *:data-panel:duration-200 *:data-panel:ease-out"
>
```

`react-resizable-panels` 通过 `flex-grow` 控制 panel 比例,直接 transition 这个属性 200ms 缓出。用 Tailwind 4 的 descendant variant `*:data-panel:` 精确命中 panel DOM 节点,不影响 PanelGroup 自身。

> 注:本批次提交的 `workspace/index.tsx` 实际用的是非 canonical 的 `[&>[data-panel]]:` 写法(没改 staged 文件的 className,避免把 lint cleanup 夹带进本次 commit)。canonical form 见上面的示例。后续单独一次 commit 把 `workspace/index.tsx` 切到 `*:data-panel:`。

### 2.7 SuggestionsPanel 自动滚到高亮项

`/`-slash 菜单用键盘上下选中时,如果列表很长,选中项可能滚出可视区。加了:

```tsx
useEffect(() => {
  const container = scrollContainerRef.current;
  const selected = container?.querySelector<HTMLElement>(
    `[data-command-index="${selectedIndex}"]`,
  );
  selected?.scrollIntoView({ block: "nearest" });
}, [selectedIndex, filteredItems]);
```

依赖里加 `filteredItems`——查询词变化时菜单内容刷新,索引 0 也得滚到顶,否则用户接着按 ↑ 会以为没生效。`block: "nearest"` 避免不必要的滚动。

## 三、变更内容(How)

### 3.1 新文件

- `packages/app/src/shared/system-ipc.ts` — `SystemIPC` interface 定义
- `packages/app/src/renderer/pages/workspace/use-window-full-screen.ts` — 全屏状态 hook

### 3.2 通道 / Type 调整

| 文件 | 改动 |
| --- | --- |
| `shared/events-ipc.ts` | import + intersection 加 `SystemIPC`;白名单加 `"isWindowFullScreen"` |
| `main/agent-ipc.ts` | import `SystemIPC`;`createTypedIpcMain` type union 加 `SystemIPC`;新增 `typedIpcMain.handle("isWindowFullScreen", ...)` handler |
| `main/agent-runtime.ts` | 无功能性改动(只在 `CombinedIPC` 里去掉 `SystemIPC`,因为 runtime 不暴露系统级方法) |

### 3.3 Renderer 改动

| 文件 | 改动 |
| --- | --- |
| `renderer/pages/workspace/index.tsx` | ResizablePanelGroup 加 transition 类 |
| `renderer/pages/workspace/chat/index.tsx` | 用 `useWindowFullScreen`;`insetForWindowControls` 派生布尔下传两个子组件 |
| `renderer/pages/workspace/chat/prompt-input/index.tsx` | 新增 `initialModel?: AvailableModel \| null` prop,转给 `useModalSelector` |
| `renderer/pages/workspace/chat/artifacts/side-chat-artifact/index.tsx` | `submitPrompt` 时 `setSideChatModel`;`<PromptInput initialModel={meta?.model ?? null} />` |
| `renderer/components/ui/collapsible.tsx` | className 提到 Panel,内层 `min-h-0` 取代强制高度 |
| `renderer/components/richtext/components/suggestions-panel.tsx` | `scrollIntoView` 自动滚动到高亮项 |
| `renderer/store/entries-slice.ts` | `getEntryState` 缺失时返回 `EMPTY_ENTRY_STATE` 共享引用 |
| `renderer/store/side-chat/side-chat-slice.ts` | `model` 字段从 `Pick<>` 改成 `AvailableModel`;对应 setter 签名同步 |

### 3.4 暂未动的相关代码

- `chat/active-session-content.tsx` 和 `chat/pending-session-content.tsx` ——**unstaged**,本 commit 不包括。需要后续 commit 处理(它们继续消费 `insetForWindowControls` 这个新 prop)。
- `store/main/session-slice.ts` ——unstaged,跟 active session 模型选择相关,后续 commit。
- `chat/session-title.ts` ——untracked 新文件,不属于本批次。

## 四、影响面与兼容窗口

### 4.1 IPC 协议

- **新通道**:`"isWindowFullScreen"`。白名单加了一条,preload 的 `invoke` 暴露面变大一条。renderer 侧已经通过 `useElectronIPC` 间接拿到,不需要改调用方。
- **删除通道**:无。
- **已有通道签名变化**:无。

旧 renderer 编译产物如果缓存着旧的 preload 脚本,在 `isWindowFullScreen` 调用时会走到 unknown channel → reject。**没有跨版本兼容需求**(Electron 自更新包,不打包跨 major 兼容),可以忽略。

### 4.2 Store / Hook

- `EntriesSlice.getEntryState` 行为变更:**只读场景**完全兼容(返回的对象永远符合原 shape);**写入场景**:调用方必须用 immutable 更新,直接 mutate 会污染所有空 session 的 fallback。审计了一遍——所有 setter 都走 `set((prev) => { ... new Map(...) })`,没有 mutate,OK。
- `SideChatSlice.setSideChatModel` 签名变更:`Pick<>` → `AvailableModel`。如果外部调用方传的还是 partial object,会 TS error。grep 确认只有 `SideChatArtifact` 一处调用,且已同步更新。
- `useWindowFullScreen` 是新 hook,无破坏性。

### 4.3 UI

- `CollapsibleContent` 行为变更:内层高度不再强制 `h-(--collapsible-panel-height)`,而是 `min-h-0`。如果调用方以前靠这个强制高度撑出空间,改完会塌。需要审计调用点(本批次未动 `active-session-content.tsx` / `pending-session-content.tsx`,后续 commit 验证)。
- 边栏折叠现在有 200ms 过渡动画。如果用户 reduce-motion 偏好开启,Tailwind 没自动跳过。**后续优化项**(见六)。

### 4.4 性能

- `getEntryState` 不再每次新建 Map——空 session 路径下 selector 引用稳定,无重渲染。
- `useWindowFullScreen` 在 resize/focus 时跑 IPC——非交互期间不会触发,可忽略。

## 五、回顾(教训 / 后续)

1. **IPC 通道按"职责"分组,不要按"模块"分组**。`agent-ipc.ts` 是早期把所有 invoke 堆一起的产物,加 `isWindowFullScreen` 时已经发出信号:不属于 agent 的东西就该出去。[[Prefer explicit over clever]]的反例——抽象边界错了,加什么都很别扭。
2. **持久化最小子集是反模式**。`Pick<AvailableModel, "modelId" | "providerId">` 看起来"省字节",实际让 UI 层每次都拿不到完整对象,逼着组件再去 IPC 查一次。`AvailableModel` 本来就是 plain object,JSON 序列化没有额外成本,直接存全。
3. **共享引用 fallback 必须 immutable**。`EMPTY_ENTRY_STATE` 这种常量返回,要求下游永远不能 mutate 它。靠的是 setter 路径都用 `new Map(prev)`。一旦有人偷懒 `current.toolStates.set(...)` 就会全局污染。这种隐性契约应该在 store 文件顶部加一行注释("treat EMPTY_ENTRY_STATE as frozen")。
4. **抽 hook 时警惕"页面渲染优化"被破坏**。原本 `isSidebarCollapsed` 是 chat 父级 prop,subscribed 子组件只会因 prop 变化重渲染。现在 hook 让 `isWindowFullScreen` 在 resize/focus 时也触发,`chat/index.tsx` 会重渲染两次(子组件也会跟着)。如果 chat 树深,值得后续用 `React.memo` 包一层;目前不深,先记着。

## 六、待办

- [ ] `active-session-content.tsx` / `pending-session-content.tsx`:把 prop 从 `isSidebarCollapsed` 切到 `insetForWindowControls`,并去掉自己再算 inset 的逻辑(本批次 unstaged)
- [ ] `main/session-slice.ts`:跟 active session 模型选择相关的改动(unstaged)
- [ ] `chat/session-title.ts`:新文件,看是否归并到本批次还是单独一个 commit(untracked)
- [ ] 给 `useWindowFullScreen` 加 `prefers-reduced-motion` 判断,折叠动画在用户开启系统级 reduce-motion 时跳过
- [ ] (可选)`EMPTY_ENTRY_STATE` 顶部加一行 `// treat as frozen — all updates must create new Map()` 警示注释
- [ ] (可选)用 `React.memo` 包 `PendingSessionContent` / `ActiveSessionContent`,避免 resize/focus 触发的不必要重渲染
