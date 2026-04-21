# divisor-agent

桌面原生 AI Agent 应用，采用 C/S 混合架构：
- Server（远程大脑）：Node.js + TypeScript，负责 Agent Loop、会话存储、LLM 调用、ACP 服务端。
- App（本地客户端）：Tauri（Rust） + React，负责本地文件系统/终端执行、ACP 通信、UI 渲染。

## 架构概览

```text
React Webview
	├─ tRPC / HTTP: 会话树、历史消息、设置等元数据
	└─ Tauri IPC: 前端与 Rust Core 交互

Rust Core
	└─ WebSocket (ACP): 与 Node Server 通信，执行本地 FS / Terminal 能力

Node Server
	├─ Express v5
	├─ tRPC
	└─ pi-agent-core
```

当前通信边界：
- 前端到服务端：tRPC / HTTP，用于元数据查询与变更。
- 前端到 Rust：Tauri IPC，用于会话启动、审批反馈等本地桥接。
- Rust 到服务端：基于 WebSocket 的 ACP 协议，用于实时对话流和工具调用。

## Monorepo 结构

项目使用 bun workspace，包位于 `packages/*`：

```text
packages/
	app/      Tauri v2 + React 19 + Vite 7 + Tailwind CSS v4
	server/   Express v5 + tRPC + zod + pino
docs/
	需求/      MVP 需求文档
	技术文档/   前后端技术拆解
	原型/      UI 原型与交互说明
	调研文档/   选型调研与架构分析
```

## 环境要求

- Node.js 22+
- Bun
- Rust toolchain（`rustup`、`cargo`）
- Tauri 开发环境

安装依赖：

```bash
bun install
```

## 常用命令

在仓库根目录执行：

```bash
# 启动所有包
bun dev

# 仅启动 server
bun dev:server

# 仅启动 app
bun --filter ./packages/app dev

# 构建
bun build

# 类型检查
bun type-check

# 测试
bun test

# 代码规范检查
bun lint
```

说明：
- `packages/server` 使用 `tsx --watch` 进行开发。
- `packages/app` 使用 `tauri dev` 启动桌面应用。
- Vite 开发端口固定为 `1420`，端口被占用时会直接失败而不是自动切换。

## 技术栈

### Server

- Node.js（ESM）
- Express v5
- tRPC
- zod v4
- pino + pino-http
- WebSocket ACP

### App

- Tauri v2
- Rust
- React 19
- Vite 7
- Tailwind CSS v4

## 项目约定

- Server 端本地 TypeScript 导入必须显式带 `.js` 扩展名。
- 纯类型导入必须使用 `import type`。
- Server 生产构建使用 `packages/server/tsconfig.build.json`。
- 根测试使用 Vitest workspace 配置。
- 共享依赖版本通过 bun workspace 自动管理。

## 文档入口

- [MVP 需求文档](docs/需求/mvp.md)
- [MVP 原型文档](docs/原型/mvp.md)
- [前端技术文档](docs/技术文档/mvp/前端.md)
- [后端技术文档](docs/技术文档/mvp/后端.md)
- [tRPC 适用性分析](docs/调研文档/tRPC适用性分析.md)

## 当前状态

当前仓库已完成：
- Monorepo 基础结构
- Server 基础骨架与 health-check
- App 基础 Tauri + React 工程
- MVP 需求、原型、技术方案与调研文档

业务能力（会话树、ACP 工具调用、审批流、Fork）仍处于设计与逐步实现阶段。
