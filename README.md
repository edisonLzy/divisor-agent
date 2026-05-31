# divisor-agent

桌面原生 AI Agent 应用，在 Electron 桌面环境中集成 AI 代理运行时，赋予 AI 直接操作本地文件系统和终端的能力。

## 项目架构

采用 **C/S 混合架构**，但目前客户端独立运行：

```
┌─────────────────────────────────────────────────────┐
│                Electron 39 应用                       │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │          Main Process (主进程)                 │   │
│  │  ┌──────────┐ ┌────────┐ ┌───────────────┐   │   │
│  │  │ Agent    │ │ Tools  │ │ Permission    │   │   │
│  │  │ Runtime  │ │ fs/    │ │ Service       │   │   │
│  │  │ (pi-     │ │ term   │ │ (请求/审批/   │   │   │
│  │  │ agent-   │ │        │ │  记住/绕过)   │   │   │
│  │  │ core)    │ │        │ │               │   │   │
│  │  └──────────┘ └────────┘ └───────────────┘   │   │
│  │  ┌──────────┐ ┌────────────────────────┐     │   │
│  │  │ Model    │ │ Extension System       │     │   │
│  │  │ Registry │ │ (discovery / loader)   │     │   │
│  │  └──────────┘ └────────────────────────┘     │   │
│  └──────────────────────────────────────────────┘   │
│                     │ IPC (contextBridge)            │
│  ┌──────────────────────────────────────────────┐   │
│  │         Renderer (React 19 前端)              │   │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────────┐   │   │
│  │  │ Chat UI  │ │ Session  │ │ Permission  │   │   │
│  │  │ (虚拟化  │ │ Sidebar  │ │ Approval    │   │   │
│  │  │  消息列  │ │ (works-  │ │ Panel       │   │   │
│  │  │  表)     │ │ pace/    │ │             │   │   │
│  │  │          │ │ session) │ │             │   │   │
│  │  └──────────┘ └──────────┘ └─────────────┘   │   │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────────┐   │   │
│  │  │ Markdown │ │ Code     │ │ Rich Text   │   │   │
│  │  │ (stream- │ │ High-    │ │ Editor      │   │   │
│  │  │  down)   │ │ light    │ │ (TipTap)    │   │   │
│  │  │          │ │ (Shiki)  │ │             │   │   │
│  │  └──────────┘ └──────────┘ └─────────────┘   │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 通信层

| 方向            | 协议                         | 用途                                             |
| --------------- | ---------------------------- | ------------------------------------------------ |
| Renderer ↔ Main | Electron IPC (contextBridge) | Agent prompt、权限审批、模型选择、工作区文件搜索 |
| App → Server    | HTTP (Axios)                 | 会话元数据持久化（Server 尚未实现）              |

## 核心功能

- **AI Agent 运行时** — 基于 `@mariozechner/pi-agent-core`，支持多轮对话、工具调用
- **文件系统工具** — 读取/写入本地文件（中等风险/高风险）
- **终端工具** — 执行 Shell 命令，内置危险命令拦截（如 `rm -rf /`）
- **权限控制系统** —
  - 实时权限请求弹窗（支持审批/拒绝）
  - "记住此命令"功能（按命令前缀自动批准）
  - 权限模式切换：默认（逐条审批）/ 完全访问（自动放行）
- **模型管理** — 从 `~/.pi/agent/models.json` 加载自定义模型配置，支持多种 AI 提供商
- **Extension 系统** — 扫描 `~/.pi/extensions/` 目录动态加载扩展（基础设施已就绪，尚未接入运行时）
- **多会话管理** — 侧边栏展示会话列表，支持置顶、分组（workspace / standalone）、创建/删除/重命名
- **工作区管理** — 新建/切换/删除工作区，可附加自定义 system prompt
- **富文本输入** — TipTap 编辑器，支持 `@` 触发文件搜索与插入（ProseMirror 驱动）
- **流式 Markdown 渲染** — streamdown 管线（CJK、代码块、数学公式、Mermaid 图表）
- **代码高亮** — Shiki 4 异步高亮，含缓存、语言选择、复制按钮
- **工具调用可视化** — 可折叠卡片展示工具名称、状态徽章、输入/输出 JSON
- **处理中状态** — 思考过程展示、工具执行状态、耗时动画

## 技术栈

### 核心

| 类别     | 技术                             |
| -------- | -------------------------------- |
| 框架     | Electron 39 + React 19 + Vite 7  |
| 构建     | electron-vite 5                  |
| 样式     | Tailwind CSS v4 + shadcn/ui      |
| 状态     | Zustand 5 (vanilla stores)       |
| Agent    | @mariozechner/pi-agent-core 0.68 |
| 类型验证 | Zod 4 + @sinclair/typebox        |

### 渲染器

| 类别       | 技术                                            |
| ---------- | ----------------------------------------------- |
| Markdown   | streamdown 2 (CJK / code / math / mermaid 插件) |
| 代码高亮   | Shiki 4                                         |
| 富文本编辑 | TipTap 3 + ProseMirror                          |
| 消息虚拟化 | @tanstack/react-virtual 3                       |
| 数据获取   | @tanstack/react-query 5 + Axios                 |
| 路由       | react-router-dom 7 (memory router)              |
| 动画       | Framer Motion (motion)                          |
| 图标       | Lucide React                                    |
| Toast 通知 | Sonner                                          |

## 目录结构

```text
packages/app/                # 桌面应用（唯一实现包）
├── src/
│   ├── main/                # Electron 主进程
│   │   ├── index.ts         # 窗口创建 & 应用入口
│   │   ├── agent-runtime.ts # Agent 运行时 (pi-agent-core 封装)
│   │   ├── agent-pool.ts    # 多会话 Agent 管理器
│   │   ├── agent-ipc.ts     # IPC 绑定 (main ↔ renderer)
│   │   ├── tools/
│   │   │   ├── types.ts     # AppTool 类型定义 (含 riskLevel)
│   │   │   ├── fs-tool.ts   # 文件读写工具
│   │   │   └── terminal-tool.ts  # 终端执行工具
│   │   ├── permissions/
│   │   │   └── permission-service.ts  # 权限审批服务
│   │   ├── models/
│   │   │   └── registry.ts  # 模型配置注册表
│   │   └── extensions/
│   │       ├── registry.ts  # Extension 注册表
│   │       ├── discovery.ts # 扩展发现
│   │       └── loader.ts    # 扩展加载器
│   ├── preload/
│   │   ├── index.ts         # contextBridge API 暴露
│   │   └── index.d.ts       # Window.electronAPI 类型声明
│   ├── renderer/
│   │   ├── main.tsx         # React 入口
│   │   ├── App.tsx          # 应用根组件 (providers)
│   │   ├── router.tsx       # 路由配置
│   │   ├── index.html       # HTML 入口
│   │   ├── index.css        # Tailwind CSS 入口
│   │   ├── context/
│   │   │   └── ElectronIPCProvider.tsx  # IPC React Context
│   │   ├── store/
│   │   │   ├── index.ts           # 主 store (组合 slices)
│   │   │   ├── types.ts           # 状态类型定义
│   │   │   ├── session-slice.ts   # 会话/工作区管理
│   │   │   ├── entries-slice.ts   # 消息条目/工具状态
│   │   │   └── permission-slice.ts # 权限请求状态
│   │   ├── hooks/
│   │   │   ├── useAgentStore.ts          # 处理中状态
│   │   │   ├── useAgentRuntime.ts        # IPC prompt 封装
│   │   │   └── use-subscribe-agent-events.ts  # 通用事件订阅
│   │   ├── apis/
│   │   │   ├── sessions.ts    # REST API 客户端
│   │   │   └── lib/
│   │   │       └── request.ts # Axios 封装
│   │   ├── pages/
│   │   │   └── workspace/
│   │   │       ├── index.tsx        # 主布局 (resizable panels)
│   │   │       ├── toggle-sidebar-button.tsx
│   │   │       ├── use-agent-messages.ts  # 事件→Store 桥接
│   │   │       ├── use-agent-sessions.ts  # 会话状态同步
│   │   │       ├── use-create-session.ts
│   │   │       ├── chat/
│   │   │       │   ├── index.tsx          # 聊天容器
│   │   │       │   ├── pending-session-content.tsx  # 起始页
│   │   │       │   ├── active-session-content.tsx   # 活跃会话
│   │   │       │   ├── messages/
│   │   │       │   │   ├── index.tsx             # 虚拟化列表
│   │   │       │   │   ├── user-message.tsx     # 用户消息
│   │   │       │   │   ├── assistant-message.tsx # 助手消息（组合）
│   │   │       │   │   ├── assistant-response-message.tsx  # 文本回复
│   │   │       │   │   ├── assistant-thinking-message.tsx   # 思考过程
│   │   │       │   │   └── assistant-tool-message.tsx       # 工具调用
│   │   │       │   ├── prompt-input/
│   │   │       │   │   ├── index.tsx             # 输入容器
│   │   │       │   │   ├── prompt-editor.tsx     # TipTap 编辑器
│   │   │       │   │   ├── modal-selector.tsx    # 模型选择器
│   │   │       │   │   └── permission-selector.tsx  # 权限模式
│   │   │       │   └── permission/
│   │   │       │       ├── index.tsx             # 审批面板
│   │   │       │       └── useCurrentPermissionRequest.ts
│   │   │       └── sessions/
│   │   │           ├── index.tsx          # 会话侧边栏
│   │   │           ├── session-item.tsx
│   │   │           ├── workspace-item.tsx
│   │   │           ├── create-workspace-button.tsx
│   │   │           ├── usePinnedSessions.ts
│   │   │           ├── useStandaloneSessions.ts
│   │   │           ├── useWorkspaceList.ts
│   │   │           └── useWorkspaces.ts
│   │   └── components/
│   │       ├── ai-elements/
│   │       │   ├── message.tsx     # 消息容器 & Branch 导航
│   │       │   ├── code-block.tsx  # Shiki 代码块
│   │       │   ├── tool.tsx        # 工具调用卡片
│   │       │   └── shimmer.tsx     # 加载动画
│   │       ├── richtext/
│   │       │   ├── schema.ts                # ProseMirror Schema
│   │       │   ├── richtext-editor.tsx      # 可编辑视图
│   │       │   └── richtext-document-view.tsx  # 只读视图
│   │       └── ui/
│   │           ├── button.tsx
│   │           ├── dialog.tsx
│   │           ├── popover.tsx
│   │           ├── resizable.tsx
│   │           ├── select.tsx
│   │           ├── scroll-area.tsx
│   │           └── ... (25+ shadcn/ui 组件)
│   └── shared/                   # IPC 类型定义
│       ├── events-ipc.ts         # 事件白名单 & 类型
│       ├── session-ipc.ts        # 会话 IPC 接口
│       ├── models-ipc.ts         # 模型 IPC 接口
│       └── permissions-ipc.ts    # 权限类型定义
```

## 环境要求

- Node.js 22+
- pnpm

```bash
pnpm install
```

## 常用命令

```bash
# 启动应用
pnpm dev

# 仅启动 server（预留 — 尚未实现）
pnpm dev:server

# 类型检查
pnpm type-check

# 运行所有测试
pnpm test

# 运行单个测试文件
pnpm vitest run packages/app/__tests__/xxx.test.ts

# Lint 检查 (oxlint)
pnpm lint

# 格式化 (oxfmt)
pnpm format
```

除此以外，也可以单独启动 app：

```bash
pnpm --filter @divisor-agent/app dev
```

## 数据流

```
用户输入 → PromptEditor (TipTap)
  → handleSubmit()
  → IPC invoke("prompt", sessionId, text, model)
  → AgentPool.prompt() → AgentRuntime.prompt()
  → Agent.prompt() 开始执行

Agent 产生事件：
  agent_start                 → IPC → useAgentMessages → store.setSessionStatus("running")
  message_start/update/end    → IPC → store.appendMessageEntry / updateMessageEntry
  tool_execution_start/update → IPC → store.setToolState
  permission_requested        → IPC → store.enqueuePermissionRequest → UI 弹窗
  agent_end                   → IPC → store.setSessionStatus("completed")
```

### IPC 通道一览

**Main → Renderer（事件）**：`agent_start`, `turn_start`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `agent_end`, `permission_requested`

**Renderer → Main（调用）**：`setModel`, `getAvailableModels`, `prompt`, `abortPrompt`, `setHistoryMessages`, `setSessionId`, `searchWorkspaceFiles`, `setPermissionMode`, `resolvePermissionRequest`

## 状态管理

使用 **Zustand 5** 单一 Store（三切片组合）：

- **sessionsSlice** — 会话列表、活跃会话、模型分配、工作区管理
- **entriesSlice** — 消息条目（流式追加/更新）、工具执行状态
- **permissionSlice** — 每个会话的权限模式、当前权限请求队列、已审批请求

## 项目约定

- **Server 导入**：如果使用 Server 包，本地 TypeScript 导入必须显式带 `.js` 扩展名（ESM 要求）
- **类型导入**：纯类型导入使用 `import type { ... }`
- **React 导入**：React 19 使用新的 JSX Runtime，无需手动 `import React from 'react'`
- **包管理**：严格使用 `pnpm`，`npx` 替换为 `pnpx`
- **依赖管理**：严格按需引入，禁止安装未使用的依赖
- **Lint/Format**：使用 `oxlint`（非 ESLint）+ `oxfmt`
- **Git Hooks**：Husky + commitlint（Conventional Commits）+ lint-staged（oxlint --fix + oxfmt --write）

## 实现状态

### ✅ 已完成

- Electron 39 桌面应用框架（无边框窗口、vibrancy、毛玻璃效果）
- pi-agent-core Agent 运行时集成
- 三款本地工具：读文件、写文件、终端执行
- 权限控制系统（请求/审批/拒绝/记住/绕过模式）
- 模型注册表（读取 `~/.pi/agent/models.json` 自定义模型）
- Extension 发现与加载基础设施（尚未接入运行时）
- 类型安全的 IPC 桥接（contextBridge + 通道白名单）
- 聊天 UI：
  - 虚拟化消息列表（@tanstack/react-virtual）
  - 用户消息（ProseMirror 只读渲染）
  - 助手消息流式渲染（streamdown + CJK/代码/数学/Mermaid）
  - 思考过程展示（可折叠 + 计时动画）
  - 工具调用卡片（状态徽章、输入输出 JSON）
- TipTap 富文本输入（支持 `@` 文件搜索建议）
- 模型选择器（按提供商分组搜索）
- 权限模式选择器（默认/完全访问）
- 会话侧边栏（置顶/工作区/独立会话分组）
- 工作区创建与管理
- Zustand 状态管理（sessions/entries/permission 三切片）
- 事件订阅系统（IPC 事件 → Store 自动同步）
- Shiki 代码高亮（缓存 + 语言选择 + 复制）
- 设置页路由（占位）

### 🏗️ 待实现

- **Server 包**（Express + tRPC + 会话持久化）— 尚未开始实现
- Extension 接入 Agent 运行时
- 会话树 / Fork 功能
- 设置页完整功能

## 设计文档

- [MVP 需求文档](docs/需求/mvp.md)
- [MVP 原型文档](docs/原型/mvp.md)
- [前端技术文档](docs/技术文档/mvp/前端.md)
- [后端技术文档](docs/技术文档/mvp/后端.md)
- [tRPC 适用性分析](docs/调研文档/tRPC适用性分析.md)
- [pi-agent-core 适用性分析](docs/调研文档/pi-agent-core适用性分析.md)
- [pi-agent-extension 机制分析](docs/调研文档/pi-agent-extension机制.md)
