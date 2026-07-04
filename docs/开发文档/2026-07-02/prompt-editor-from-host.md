# 扩展如何向 Prompt Editor 插入自定义节点

## 背景

扩展(典型场景:artifactPanel 上点 button 触发)需要从任意 React 位置向「当前 active session 的 prompt editor」插入内容。

Slash command(走 `RendererExtensionContext.slashCommands`)已经能插内容,但要求用户先打 `/` + 选中命令 —— 交互成本高,artifactPanel 这种「点一下就插」的场景不适用。

`prompt-insert-event.ts` 的 `INSERT_PROMPT_TEXT_EVENT` 也存在,但:

1. 只能插字符串,不能插结构化 TipTap 节点(自定义 node type 不在 schema 里会被丢弃)。
2. 该 event 当前全 app 零调用方,等于孤儿钩子,扩展要用它需要在两端 import 常量。
3. 解决"插入结构化节点"和"读 editor 状态(selection、focus)"的诉求时依然绕不开 editor 引用。

需要一条**让扩展拿到当前 editor 引用**的官方通道。

## 设计选择

### 为什么是「跨 React 树的模块级 cell」而不是 Context / zustand / window event

考察过三条候选:

| 方案 | 否决原因 |
|---|---|
| React Context | Producer(`<PromptInput>`)在 consumer(`App.tsx` 里的 API 对象字面量)**下方**;Context 只能向下传播,反向不通。 |
| zustand slice | 扩展侧是**命令式**消费(点 button 调 `.get()`),不需要订阅式 re-render;slice 引入 re-render fanout 但零收益。 |
| `window` 上的事件总线 | `INSERT_PROMPT_TEXT_EVENT` 已经是这个模式,但只解决"插文本",不解决"读 editor"。 |
| **模块级 cell** | 跨树、单例、命令式;host 在 `onCreate` 写入,扩展在 `get()` 读出。零订阅,零 re-render。 |

模块级 cell 跟 `INSERT_PROMPT_TEXT_EVENT`、slash commands 一样是 extension-core 现有「renderer 侧命令式桥」风格 —— 沿用惯例,不发明新模式。

### 为什么 onCreate/onDestroy 配对

`@tiptap/react@3.22.5` 的 `useEditor` 在以下场景销毁并重建 editor:

1. `useEditor` 第二个参数(deps)任一元素值变化。
2. 组件 unmount(`scheduleDestroy` 触发)。

`<PromptInput>` 没有传 `content`,deps 始终是 `[undefined]`,sessionId 变化不销毁 editor。但 `<PromptInput>` 会因为 `pendingPermissionRequest` 条件渲染而被 unmount/remount(见 `active-session-content.tsx:124-139`),**每次 unmount 都会触发 `onDestroy`,每次 remount 都会触发 `onCreate`**。

如果只挂 `onCreate` 不挂 `onDestroy`,`sharedPromptEditor.editor` 会**指向一个已经 destroyed 的 editor 实例**;扩展侧调 `editor.chain()` 会抛 `View is not mounted.` 之类的错。配对是必要的。

## 改动

### 1. `packages/extension-core/src/renderer/sharedPromptEditor.ts` — 新增

模块级 cell,`Editor | null`。`SharedPromptEditor` 类用 getter/setter 而不是 `editor: Editor | null` 字段,这样:

- 类型不变量更明显(setter 接受 `null`,getter 显式 nullable)
- 单元测试时可以 mock 而不用替换整个 module

```ts
import type { Editor } from '@tiptap/core'

export class SharedPromptEditor {
    private _editor: Editor | null = null

    get editor() { return this._editor }
    set editor(editor: Editor | null) { this._editor = editor }

    static create() { return new SharedPromptEditor() }
}

export const sharedPromptEditorContext = new SharedPromptEditor()
```

### 2. `packages/extension-core/src/renderer/contextAPI.tsx` — 新增字段

`ExtensionsContextAPI` 加上 `sharedPromptEditor: SharedPromptEditor`。**注意是值(类实例)而不是类型**。

### 3. `packages/extension-core/src/renderer/hooks.ts` — 新增 `useSharedPromptEditor`

```ts
export function useSharedPromptEditor() {
    const api = useExtensionsContextAPI();
    return api.sharedPromptEditor
}
```

返回 cell 本身,扩展侧 `useSharedPromptEditor().editor` 即可。

### 4. `packages/app/src/renderer/App.tsx` — 工厂化

```ts
const extensionsContextAPI = useMemo<ExtensionsContextAPI>(() => ({
  ...,
  sharedPromptEditor: SharedPromptEditor.create()
}), []);
```

`useMemo([])` 保证整棵树只创建一次 cell 实例。

### 5. `packages/app/src/renderer/pages/workspace/chat/use-chat-editor.ts` — 透传 lifecycle

`UseChatEditorOptions` 加 `onCreate?: EditorOptions["onCreate"]` 和 `onDestroy?: EditorOptions["onDestroy"]`,在 `useEditor` 配置里透传。**不破坏** 现有 `setHasContent` 的 `onCreate` / `onUpdate` 逻辑 —— 用户传入的 `onCreate` 先执行,内部 `setHasContent` 后执行(顺序无关紧要,但保留 `setHasContent` 在外层更稳)。

### 6. `packages/app/src/renderer/pages/workspace/chat/prompt-input/index.tsx` — 透传到上层

`PromptInputProps extends Pick<UseChatEditorOptions, "onCreate" | "onDestroy">`,直接转发给 `useChatEditor`。

### 7. `packages/app/src/renderer/pages/workspace/chat/active-session-content.tsx` — 写入 cell

```ts
const sharedPromptEditor = useSharedPromptEditor()

const handlePromptInputCreated: PromptInputProps["onCreate"] = ({ editor }) => {
  sharedPromptEditor.editor = editor;
};

const handlePromptInputDestroyed: PromptInputProps["onDestroy"] = () => {
  sharedPromptEditor.editor = null;
};

<PromptInput
  ...
  onCreate={handlePromptInputCreated}
  onDestroy={handlePromptInputDestroyed}
/>
```

### 8. `packages/extension-example/src/renderer.tsx` — 示例用法

`ExampleCard` 加一个 "Insert into prompt" 按钮:

```ts
const sharedEditor = useSharedPromptEditor().editor;

const insertIntoPrompt = () => {
  if (!sharedEditor) {
    console.warn("[extension-example] prompt editor unavailable");
    return;
  }
  sharedEditor.chain().focus()
    .insertContentAt(sharedEditor.state.doc.content.size, "\n[example-card:...]")
    .run();
};
```

按钮 `disabled={!sharedEditor}`,editor 不可用时(权限面板打开、未挂载等)显式拒绝。

## 端到端行为验证

### 正常生命周期

1. 打开 app → `<PromptInput>` 挂载 → `onCreate` 触发 → `sharedPromptEditor.editor = editor` ✅
2. 切到 `<PermissionApprovalPanel>`(处理权限请求)→ `<PromptInput>` 卸载 → `onDestroy` 触发 → `sharedPromptEditor.editor = null` ✅
3. 处理完权限 → `<PromptInput>` 重新挂载 → `onCreate` 触发 → cell 重新填充新 editor ✅

任何时刻扩展侧 `useSharedPromptEditor().editor` 拿到的是「当前 active editor 或 null」。

### StrictMode 下的双调

开发模式 React StrictMode 会强制 mount → unmount → mount 一次:

```
xx  (onCreate)
yy  (onDestroy)        ← 第一次 unmount
xx  (onCreate)         ← 第二次 mount
```

最终 cell 持有的是 active editor。✅

`onDestroy` 不会被遗漏(对 `onCreate` 总是对称成对),即使有 bug 漏挂 `onDestroy` 也会在 dev 期间暴露。

## 使用约定

### 扩展侧:何时用 `useSharedPromptEditor().editor` / `INSERT_PROMPT_TEXT_EVENT` / slash commands

| 场景 | 推荐方式 |
|---|---|
| 点 button 插**结构化 TipTap 节点**或读取 editor 状态 | `useSharedPromptEditor().editor` + `editor.chain()` |
| 点 button 插**纯文本**占位 | `useSharedPromptEditor().editor` 直接 `insertContent`,**或** `INSERT_PROMPT_TEXT_EVENT` |
| 用户先打 `/` + 选命令 | slash command(`ctx.slashCommands.register`) |

文字插入两种方式选哪个:**优先用 editor 引用**。`INSERT_PROMPT_TEXT_EVENT` 是为了不依赖 editor 实例的场景(比如 hotkey 触发的快速操作)而保留,不是首选。

### 扩展侧:`null` 兜底

`useSharedPromptEditor().editor` 可能为 `null`(权限面板、未挂载)。**所有用法必须 null-guard** —— 不要假设 editor 永远在。

## 限制与未来

### 当前限制

1. **只能插入到当前 active session 的 editor。** 多 session 切换、side chat editor 都不在范围内。如果以后要支持 side chat,需要把 cell 从「单实例」改为「按 sessionId 索引」(`Map<string, SharedPromptEditor>`),并在 `useSharedPromptEditor(sessionId?)` 上加可选参数。

2. **只能插入「editor schema 已知的节点」或纯文本。** 如果要插自定义 TipTap node,需要扩展在 `RendererExtensionContext` 上注册节点(目前没有 `tiptapNodes` 子 API),host 在 `useChatEditor` 把它们并入 `useEditor({ extensions })`。这超出了本次 commit 的范围,留作后续工作。

3. **没有「focus 守门」。** 扩展拿到的 editor 引用,可能因为 `disabled` 切换(agent 运行时被设 `editable: false`)而无法接收输入 —— `editor.chain().focus().insertContent(...)` 仍能跑(写不进去),但用户体验可能怪。后续可以加一个 `isEditable` 检查。

## 相关文件

- `packages/extension-core/src/renderer/sharedPromptEditor.ts`(新增)
- `packages/extension-core/src/renderer/contextAPI.tsx`(API 字段)
- `packages/extension-core/src/renderer/hooks.ts`(`useSharedPromptEditor`)
- `packages/extension-core/src/renderer/index.ts`(re-export)
- `packages/app/src/renderer/App.tsx`(`SharedPromptEditor.create()` 工厂)
- `packages/app/src/renderer/pages/workspace/chat/use-chat-editor.ts`(lifecycle 透传)
- `packages/app/src/renderer/pages/workspace/chat/prompt-input/index.tsx`(props 透传)
- `packages/app/src/renderer/pages/workspace/chat/active-session-content.tsx`(写入 cell)
- `packages/extension-example/src/renderer.tsx`(示例 button)
- `packages/app/src/renderer/pages/workspace/chat/prompt-insert-event.ts`(并行通道,文本插入)
