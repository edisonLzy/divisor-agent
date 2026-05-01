# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Divisor-agent is a desktop AI agent app using a C/S hybrid architecture:

- **Server** (`packages/server`): Remote brain — Express v5 + tRPC + Zod, handles session persistence and model configuration
- **App** (`packages/app`): Local client — Electron 39 + React 19, handles agent execution, tools, and UI rendering

## Common Commands

```bash
pnpm dev              # Start all packages in parallel
pnpm dev:server       # Start server only (tsx --watch)
pnpm dev:app          # Start Electron app with electron-vite
pnpm build            # Build all packages
pnpm type-check       # Type-check all packages
pnpm test             # Run all tests (Vitest workspace)
pnpm lint             # ESLint check
```

Single package commands:

```bash
pnpm --filter @divisor-agent/server dev
pnpm --filter @divisor-agent/app dev
pnpm --filter @divisor-agent/server test
```

## Architecture

### Communication Layers

| Layer                    | Protocol                     | Purpose                                      |
| ------------------------ | ---------------------------- | -------------------------------------------- |
| Frontend ↔ Electron Main | Electron IPC (contextBridge) | Agent prompt, permissions, model selection   |
| Frontend ↔ Server        | tRPC (HTTP)                  | Session metadata (tree, history), model list |
| Electron Main ↔ Server   | HTTP/tRPC                    | Session persistence, model config            |

### Monorepo Structure

```
.
├── docs/                           # Project documentation
│   ├── 调研文档/                    # Research documents (pi-agent-core, extension, tRPC analysis)
│   ├── 技术文档/mvp/               # Technical docs (frontend, backend MVP specs)
│   ├── 需求/                        # Requirements (mvp.md)
│   └── 原型/                        # Prototypes
├── packages/
│   ├── app/                        # Electron + React 19 + shadcn/ui
│   │   ├── __tests__/              # App tests
│   │   ├── electron.vite.config.ts
│   │   ├── electron-builder.yml
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── main/               # Electron main process
│   │       │   ├── index.ts       # Main entry (BrowserWindow, IPC handlers)
│   │       │   ├── agent-runtime.ts # Agent orchestration
│   │       │   ├── agent-ipc.ts    # Agent IPC handlers
│   │       │   ├── tools/          # Built-in tools
│   │       │   │   ├── fs-tool.ts
│   │       │   │   └── terminal-tool.ts
│   │       │   ├── models/         # Model registry
│   │       │   │   └── registry.ts
│   │       │   ├── permissions/    # Permission service
│   │       │   │   └── permission-service.ts
│   │       │   └── extensions/     # Extension system
│   │       │       ├── loader.ts
│   │       │       ├── registry.ts
│   │       │       └── discovery.ts
│   │       ├── preload/            # Electron preload scripts
│   │       │   ├── index.ts        # contextBridge API exposure
│   │       │   └── index.d.ts
│   │       ├── renderer/           # React frontend
│   │       │   ├── index.html
│   │       │   ├── main.tsx
│   │       │   ├── App.tsx
│   │       │   ├── index.css
│   │       │   ├── shim.d.ts
│   │       │   ├── context/
│   │       │   │   └── ElectronIPCProvider.tsx
│   │       │   ├── hooks/
│   │       │   │   ├── useAgentStore.ts
│   │       │   │   └── useAgentRuntime.ts
│   │       │   ├── lib/
│   │       │   │   └── utils.ts
│   │       │   ├── components/
│   │       │   │   ├── ai-elements/  # AI-specific UI components
│   │       │   │   │   ├── code-block.tsx
│   │       │   │   │   ├── message.tsx
│   │       │   │   │   └── tool.tsx
│   │       │   │   ├── richtext/      # Rich text editor
│   │       │   │   │   ├── schema.ts
│   │       │   │   │   ├── richtext-editor.tsx
│   │       │   │   │   └── richtext-document-view.tsx
│   │       │   │   └── ui/            # shadcn/ui components
│   │       │   │       ├── button.tsx
│   │       │   │       ├── input.tsx
│   │       │   │       ├── dialog.tsx
│   │       │   │       └── ... (27 components)
│   │       │   └── workspace/
│   │       │       ├── sessions/      # Session sidebar
│   │       │       │   └── index.tsx
│   │       │       └── chat/          # Main chat interface
│   │       │           ├── index.tsx
│   │       │           ├── chat-types.ts
│   │       │           ├── useChat.tsx
│   │       │           ├── messages/   # Message components
│   │       │           │   ├── user-message.tsx
│   │       │           │   ├── assistant-message.tsx
│   │       │           │   ├── assistant-response-message.tsx
│   │       │           │   ├── assistant-thinking-message.tsx
│   │       │           │   ├── assistant-tool-message.tsx
│   │       │           │   └── index.tsx
│   │       │           └── prompt-input/
│   │       │               └── index.tsx
│   │       └── shared/             # Shared IPC types
│   │           ├── message-ipc.ts
│   │           ├── models-ipc.ts
│   │           └── session-ipc.ts
│   └── server/                    # Express v5 + tRPC + Zod
│       ├── __tests__/             # Server tests
│       ├── vitest.config.ts
│       └── src/
│           ├── index.ts           # Server entry point
│           ├── app.ts             # Express app creation
│           ├── router.ts          # Root tRPC router
│           ├── expose.ts          # Public type exports
│           ├── config/
│           │   └── env.ts         # Environment configuration
│           ├── errors/
│           │   └── app-error.ts  # Custom error class
│           ├── middlewares/
│           │   ├── response.ts
│           │   ├── error.ts
│           │   └── request-log.ts
│           ├── shared/
│           │   ├── trpc.ts       # tRPC initialization
│           │   └── logger.ts     # Pino logger
│           ├── types/
│           │   └── index.ts
│           └── domain/            # Feature modules
│               ├── models/        # Model configuration
│               │   ├── router.ts
│               │   ├── service.ts
│               │   └── types.ts
│               └── sessions/      # Session persistence
│                   ├── router.ts
│                   ├── service.ts
│                   └── types.ts
├── vitest.config.ts               # Root vitest workspace config
├── pnpm-workspace.yaml
├── package.json
└── CLAUDE.md
```

### UI Theme

The app uses a dark theme with the following color palette:

- Background: `#111111` (main), `#141414` (sidebar), `#222222` (hover/active)
- Border: `#2C2C2C`
- Text: `#D4D4D4` (primary), `#9E9E9E` (secondary), `#666666` (muted)
- Accent: `#EFEFEF` (headings)

## Key Conventions

- **Server imports**: Always include `.js` extension for local TypeScript imports (ESM requirement)
- **Type imports**: Use `import type { ... }` for pure type imports
- **React imports**: 项目使用 React 19 和新的 JSX Runtime，不需要在 `.tsx` / `.jsx` 文件中手动 `import React from 'react';`
- **Package Manager**: Strictly use `pnpm` as the package manager. `bun`, `npm`, or `yarn` should not be used
- **Node Linker**: 使用 `nodelinker=hoisted` 配置，创建扁平化的 `node_modules`（在 `.npmrc` 中配置）
- **Dependencies**: pnpm workspace 自动管理共享依赖版本
- **Dependencies**: 严格按需引入依赖。严禁安装当前未使用的依赖（例如：在使用 TipTap 时，仅在真正用到某个特定插件时才进行安装，未使用到的插件绝对不要提前引入或安装）
- **Testing**: Root `vitest.config.ts` uses workspace mode; each package has its own `vitest.config.ts`
- **Production build**: Server uses `packages/server/tsconfig.build.json` (excludes tests)

## Agent Runtime (Main Process)

The `AgentRuntime` class in `packages/app/src/main/agent-runtime.ts` manages:

- **Sessions**: Creates/manages per-session `Agent` instances using `@mariozechner/pi-agent-core`
- **Tools**: Built-in tools (fs read/write, terminal) + extension tools
- **Permissions**: `PermissionService` blocks high-risk operations until user approves
- **Extensions**: `ExtensionRegistry` discovers and loads extensions from `~/.pi/agent/extensions/`
- **Models**: `ModelService` resolves model config from `ModelRegistry`

### Permission System

High-risk operations (defined in `PermissionService.isHighRisk()`) require user approval:

1. Tool call triggers permission check
2. UI shows permission dialog via IPC event
3. User approves/rejects via `permissionApprove` / `permissionReject` IPC calls

### Extension System

Extensions are discovered from `~/.pi/agent/extensions/` and loaded via `ExtensionRegistry`:

- Each extension can provide tools and metadata
- Extensions are loaded at startup via `loadAllExtensions()`

## MVP Status

The project is in MVP development. Current state:

- Monorepo scaffolding and tooling are set up
- Server has Express + tRPC skeleton with sessions and models routers
- App has Electron + React shell with dark theme workspace UI
- Agent runtime, permission system, and extension system are implemented
- Session management, model selection, and permission approval flows are wired up
- Chat UI with message components (user, assistant, thinking, tool messages)
- Rich text editor for prompt input
