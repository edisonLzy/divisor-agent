# Copilot Instructions — divisor-agent

## Project Overview

桌面原生 AI Agent 应用，采用 C/S 混合架构：

- **Server**（远程大脑）：Node.js + pi-agent-core，驱动 Agent Loop、管理会话、调用 LLM。
- **App**（本地客户端）：Tauri（Rust）+ React，负责本地 FS/Terminal 执行、ACP 通信、UI 渲染。

架构详情见 [docs/需求/mvp.md](../docs/需求/mvp.md)。前后端技术文档见 [docs/技术文档/mvp/](../docs/技术文档/mvp/)。

---

## Monorepo 结构

pnpm workspaces，包位于 `packages/*`：

| 包                      | 路径               | 职责                            |
| :---------------------- | :----------------- | :------------------------------ |
| `@divisor-agent/server` | `packages/server/` | HTTP API + ACP WebSocket 服务端 |
| `divisor-agent` (app)   | `packages/app/`    | Tauri + React 桌面客户端        |

---

## 常用命令

```bash
# 开发
pnpm dev              # 启动所有包
pnpm dev:server       # 仅启动 server（tsx --watch）
pnpm dev:app          # 仅启动 app（tauri dev）

# 构建
pnpm build            # 构建所有包
pnpm type-check       # TypeScript 类型检查（仅 server，app 无此脚本）

# 测试（vitest workspace，注入 JWT_SECRET 测试环境变量）
pnpm test             # 运行所有包测试

# 代码规范
pnpm lint             # eslint .
```

---

## 关键约定（避免踩坑）

### Server（`packages/server/`）

- **`.js` 扩展名必填**：NodeNext 模块解析要求所有本地导入显式带 `.js`（即使源文件是 `.ts`）。
  ```ts
  // ✅ 正确
  import { logger } from "./shared/logger.js";
  // ❌ 错误（运行时 404）
  import { logger } from "./shared/logger";
  ```
- **`import type` 强制**：纯类型导入必须使用 `import type { Foo }`，lint 报 error。
- **两套 tsconfig**：
  - `tsconfig.json` — 含测试文件，供 IDE / 全量类型检查用。
  - `tsconfig.build.json` — 排除测试文件，**生产构建必须用此文件**。
- **响应格式**：统一通过 `res.success<T>(data)` 返回，类型扩展见 `src/types/global.d.ts`。
- **框架**：Express **v5**（非 v4），错误处理语法有差异。
- **日志**：pino + pino-http。
- **校验**：zod v4。

### App（`packages/app/`）

- **Vite 端口固定 1420**，`strictPort: true`，端口占用会立即报错而非自动换端口。
- **Tailwind CSS v4**：通过 `@tailwindcss/vite` 插件集成，**无** `tailwind.config.js`，**无** PostCSS 配置。
- **Rust 环境**：需单独安装 `rustup` + `cargo` + Tauri CLI。`@tauri-apps/cli` 只是 npm 封装。

### 全局规范

- **ESLint（`@stylistic`）**：2 空格缩进、单引号、有分号、`function`/`export` 前空行、禁止 import 后连续空行。
- **lint-staged**：仅覆盖 `*.{js,ts}`，`.tsx/.jsx` 不会在提交时自动修复，需手动 lint。
- **Commitlint**：conventional commits（`feat:`, `fix:` 等），header/body 长度不限制。
- **pnpm catalog**：共享依赖版本在 `pnpm-workspace.yaml` 中以 `catalog:` 声明，新增共享依赖应优先查阅 catalog。
- **依赖引用原则（严格按需）**：严禁引入当前项目暂未使用的依赖库（例如在使用 TipTap 插件时，未实际编码用到该插件时，绝对不可提前安装或引入）。
- **测试环境变量**：vitest 根配置注入 `JWT_SECRET`（≥32 字符），server 测试依赖此变量。

---

## 架构边界

| 能力                             | 由谁负责                    |
| :------------------------------- | :-------------------------- |
| UI 渲染、HTTP 元数据请求         | React（Webview JS）         |
| ACP WebSocket 长连接             | Tauri Rust Core             |
| 本地文件系统 / 终端执行          | Tauri Rust Core             |
| 高风险操作审批弹窗               | React（监听 Rust IPC 事件） |
| Agent Loop、LLM 调用、会话持久化 | Node Server                 |

前端通过 `invoke` / `listen` 与 Rust 通信；Rust 维护与 Server 的 ACP WebSocket；前端也直接通过 HTTP 访问 Server 的元数据 API。

---

## 关键文件索引

| 文件                                     | 说明                              |
| :--------------------------------------- | :-------------------------------- |
| `pnpm-workspace.yaml`                    | 工作区定义 + 共享依赖版本 catalog |
| `eslint.config.mjs`                      | 全局 ESLint 规则                  |
| `vitest.config.ts`                       | 根 vitest 配置（workspace 模式）  |
| `commitlint.config.js`                   | commit message 规则               |
| `packages/server/src/types/global.d.ts`  | Express 响应类型扩展              |
| `packages/server/tsconfig.build.json`    | 生产构建用 tsconfig               |
| `packages/app/src-tauri/tauri.conf.json` | Tauri 应用配置                    |
| `docs/需求/mvp.md`                       | MVP 完整需求文档                  |
| `docs/技术文档/mvp/前端.md`              | 前端技术文档                      |
| `docs/技术文档/mvp/后端.md`              | 后端技术文档                      |
