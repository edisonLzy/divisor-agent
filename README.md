# divisor-agent

桌面原生 AI Agent 应用，采用 C/S 混合架构：

- **Server（远程大脑）**：Node.js + Express v5 + tRPC，负责会话存储、模型配置等元数据管理。
- **App（本地客户端）**：Electron + React 19，负责本地文件系统/终端执行、Agent 运行时、UI 渲染。

## 架构概览

```text
React Webview
  ├─ tRPC / HTTP: 会话树、历史消息、设置等元数据
  └─ Electron IPC: 前端与主进程交互

Electron Main Process (Node.js/Bun)
  ├─ Agent Runtime (@mariozechner/pi-agent-core)
  ├─ Extensions Loader
  ├─ Tools (fs, terminal)
  └─ Permission Service

Node Server
  ├─ Express v5
  ├─ tRPC v11
  └─ Session persistence (JSON files)
```

当前通信边界：

- 前端到服务端：tRPC / HTTP，用于元数据查询与变更。
- 前端到 Electron 主进程：Electron IPC，用于会话启动、审批反馈等本地桥接。
- Electron 主进程到服务端：HTTP/tRPC，用于会话持久化。

## Monorepo 结构

项目使用 pnpm workspace，包位于 `packages/*`：

```text
packages/
  app/      Electron 39 + React 19 + Vite 7 + electron-vite
  server/   Express v5 + tRPC v11 + Zod v4 + pino
docs/
  需求/      MVP 需求文档
  技术文档/   前后端技术拆解
  原型/      UI 原型与交互说明
  调研文档/   选型调研与架构分析
```

## 环境要求

- Node.js 22+
- pnpm

安装依赖：

```bash
pnpm install
```

## 常用命令

在仓库根目录执行：

```bash
# 启动所有包
pnpm dev

# 仅启动 server
pnpm dev:server

# 仅启动 app
pnpm --filter @divisor-agent/app dev

# 构建
pnpm build

# 类型检查
pnpm type-check

# 测试
pnpm test

# 代码规范检查
pnpm lint
```

说明：

- `packages/server` 使用 `tsx --watch` 进行开发。
- `packages/app` 使用 `electron-vite dev` 启动桌面应用。

## 调试

### App 调试（主进程）

1. `cd packages/app && pnpm run dev`
2. `Cmd + Shift + D` 打开调试器
3. 选择 **"App/Attach to Main Debugger"** 连接到调试服务

### Server 调试

可直接使用 VS Code 的 Node.js 调试配置， attach 到 server 端口。

## 技术栈

### Server

- Node.js（ESM）
- Express v5
- tRPC v11
- Zod v4
- pino + pino-http
- Superjson

### App

- Electron 39
- electron-vite
- React 19
- Vite 7
- Tailwind CSS v4
- @electron-toolkit/preload + utils

## 项目约定

- Server 端本地 TypeScript 导入必须显式带 `.js` 扩展名。
- 纯类型导入必须使用 `import type`。
- Server 生产构建使用 `packages/server/tsconfig.build.json`。
- 根测试使用 Vitest workspace 配置。
- 共享依赖版本通过 pnpm workspace 自动管理。

## 文档入口

- [MVP 需求文档](docs/需求/mvp.md)
- [MVP 原型文档](docs/原型/mvp.md)
- [前端技术文档](docs/技术文档/mvp/前端.md)
- [后端技术文档](docs/技术文档/mvp/后端.md)
- [tRPC 适用性分析](docs/调研文档/tRPC适用性分析.md)

## 当前状态

当前仓库已完成：

- Monorepo 基础结构
- Server 基础骨架（Express + tRPC + sessions + models）
- App 基础 Electron + React 工程
- MVP 需求、原型、技术方案与调研文档

业务能力（会话树、Agent 工具调用、审批流、Fork）仍处于设计与逐步实现阶段。
