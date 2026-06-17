# @divisor-agent/extension-example

一个 **教学用 / 模板用** 的扩展,展示 `@divisor-agent/extension-core` 暴露的所有扩展点。它本身不解决任何产品问题,只把"扩展能干什么"跑通一遍,供新增扩展时复制改造。

包名已经按扩展命名规范命名为 `extension-example`,源码位于 `packages/extension-example/`。

## 它演示了什么

| 扩展点(API)         | 注册内容                                | 作用                                                                 |
| -------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| `systemPrompt`       | `example.prompt`                        | 告诉主 Agent 何时发出 `divisor-block` / `divisor-artifact` 围栏代码块 |
| `tools`              | `example/hello`                         | 最简单的工具:接收 `name`,返回 `Hello, <name>`                       |
| `slashCommands`      | `example.insert-card`                   | 在输入框输入 `/Insert example card`,插入一段提示模板                  |
| `assistantBlocks`    | `example.card`                          | 渲染端注册一个 assistant 区块类型,展示 `title` 字段                 |
| `artifacts`          | `example.artifact`                      | 注册一个 artifact 类型,在右侧面板里渲染                              |

每一项都是 `extension-core` 提供的最小可运行示例,复制改名即可成为新的扩展。

## 架构

```
主进程 (src/main.ts)
  ─ systemPrompt.register("example.prompt")
       → 告诉 Agent 在合适的时候用围栏格式输出 UI
  ─ tools.register("example/hello")
       → 用户在对话中触发时,主 Agent 拿到 "Hello, ..." 的工具结果

渲染进程 (src/renderer.tsx)
  ─ slashCommands.register("example.insert-card")
       → /Insert example card  → 在编辑器中插入提示模板
  ─ assistantBlocks.register("example.card")
       → 当主 Agent 发出 ```divisor-block type=example.card``` 时,
          把 props.title 渲染成一个简单卡片
  ─ artifacts.register("example.artifact")
       → 当主 Agent 发出 ```divisor-artifact type=example.artifact``` 时,
          在右侧面板里渲染标题 + artifactId
```

> 提示:主进程通过 `formatArtifactFence` / `formatAssistantBlockFence`(来自 `@divisor-agent/extension-core/common`)来生成合规的围栏字符串,主 Agent 看到这段提示后就能在回答里原样输出。直接手写 JSON 容易被模型丢掉字段或加多余空格。

## 暴露的入口(`exports`)

| 子路径       | 来源             | 用途                                |
| ------------ | ---------------- | ----------------------------------- |
| `./manifest` | `src/manifest.ts` | `id: "example"`,`name: "Example"`    |
| `./main`     | `src/main.ts`     | 主进程扩展:系统提示 + 工具          |
| `./renderer` | `src/renderer.tsx` | 渲染进程扩展:指令 + 区块 + artifact  |

主 App 通过 `packages/app/src/{main,renderer}/extensions/installed-extensions.ts` 在主进程 / 渲染进程两侧各挂一次。

## 快速验证

1. 启动 dev server:`pnpm dev:app`
2. 在输入框输入 `/` → 看到 "Insert example card",选中后在编辑器里出现模板文字
3. 提交这条消息 → 主 Agent 会调用 `example/hello` 工具,输出 `Hello, World` 之类的文本
4. 让 Agent 输出一段 `divisor-block` 围栏(`type: "example.card"`)→ 聊天流里出现一个简单的卡片
5. 让 Agent 输出一段 `divisor-artifact` 围栏(`type: "example.artifact"`)→ 右侧面板打开对应 artifact

## 用作模板

新增扩展时建议这样起步:

```bash
cp -R packages/extension-example packages/extension-<your-name>
```

然后改这几处即可:

- `package.json` — `name` 改为 `@divisor-agent/extension-<your-name>`;`exports` 里的子路径保持 `./manifest` / `./main` / `./renderer` 三件套
- `src/manifest.ts` — `id` 必须是稳定且唯一的字符串,后续在 artifact / 区块 / 工具命名里都建议带上这个前缀
- `src/main.ts` — 替换示例的 system prompt 和 tool 实现
- `src/renderer.tsx` — 替换示例的 slash command / block / artifact
- `packages/app/package.json` — 把新包加到 `dependencies`
- `packages/app/electron.vite.config.ts` — 在 `externalizeDeps.exclude` 数组里追加新包名(source-only 包必须)
- `packages/app/src/{main,renderer}/extensions/installed-extensions.ts` — 在 `installedMainExtensions` / `installedRendererExtensions` 数组里追加新条目

`pnpm install` 之后,新扩展即在主 App 中可用。

## externalize 说明

本包与 `extension-core` / `extension-subagents` 一样是 **source-only** workspace 包,`package.json` 的 `exports` 直接指向 `.ts` 源文件,没有 `tsc` 构建步骤。

为了让 Electron 主进程在 dev 模式下能正确加载这个包,`packages/app/electron.vite.config.ts` 的 `build.externalizeDeps.exclude` 必须显式列出包名:

```ts
externalizeDeps: {
  exclude: [
    "@divisor-agent/extension-core",
    "@divisor-agent/extension-example",
    "@divisor-agent/extension-subagents",
  ],
}
```

如果将来新增 source-only 包,记得同步更新这份清单(详见仓库根目录的 `CLAUDE.md`)。

## 依赖

- `@divisor-agent/extension-core` — 扩展运行时 API
- `@sinclair/typebox` — 工具参数 schema
- peer: `react` + `@types/react` + `@tiptap/core`(用于 slash command 的 `editor`)

## 目录结构

```
packages/extension-example/
├── README.md
├── package.json
└── src/
    ├── manifest.ts    # 扩展清单
    ├── main.ts        # 主进程:系统提示 + 工具
    └── renderer.tsx   # 渲染进程:指令 + 区块 + artifact
```
