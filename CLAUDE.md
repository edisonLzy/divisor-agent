# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Divisor-agent is a desktop AI agent app using a C/S hybrid architecture:
- **Server** (`packages/server`): Remote brain — Express v5 + tRPC + Zod, handles session persistence and model configuration
- **App** (`packages/app`): Local client — electrobun + React 19 Webview, handles agent execution, tools, and UI rendering

## Common Commands

```bash
bun dev              # Start all packages in parallel
bun dev:server       # Start server only (tsx --watch)
bun dev:app          # Start electrobun app with HMR
bun dev:hmr          # Run Vite dev server for frontend HMR
bun build            # Build all packages
bun type-check       # Type-check all packages
bun test             # Run all tests (Vitest workspace)
bun lint             # ESLint check
```

Single package commands:
```bash
bun --filter @divisor-agent/server dev
bun --filter @divisor-agent/server test
```

## Architecture

### Communication Layers

| Layer | Protocol | Purpose |
|---|---|---|
| Frontend ↔ Bun | electrobun RPC (`defineElectrobunRPC`) | Agent prompt, permissions, model selection |
| Frontend ↔ Server | tRPC (HTTP/SSE) | Session metadata (tree, history), model list |
| Bun ↔ Server | None (local execution) | Agent runs entirely in-process |

### Monorepo Structure

```
packages/
  app/                    # electrobun + React 19 + Tailwind v4 + shadcn/ui
    src/
      mainview/          # React frontend
        components/      # UI components (shadcn/ui + custom ai-elements)
        hooks/           # React hooks (useAgentStore, useAgentRuntime)
        lib/             # Utilities (utils.ts)
        modules/         # Page modules (workspace/)
          workspace/      # Main workspace (Workspace, Messages, InstructionInput)
        App.tsx          # Root component with dark theme layout
        main.tsx         # React entry point
        index.css        # Tailwind v4 + custom CSS variables
      bun/               # Bun runtime (desktop backend)
        agent-runtime.ts # Agent orchestration (sessions, permissions, extensions)
        extensions/      # Extension system (loader, registry, discovery)
        models/          # Model registry and runtime (supports custom models)
        permissions/     # Permission service (high-risk operation gating)
        tools/           # Built-in tools (fs read/write, terminal)
        index.ts         # electrobun BrowserWindow entry point
      shared/
        ipc-types.ts     # Shared IPC type definitions
  server/                 # Express v5 + tRPC + Zod + Superjson + Pino
    src/
      domain/             # Feature modules
        models/           # Model configuration tRPC router
          router.ts       # tRPC router for model list
          service.ts      # Model resolution from ~/.pi/agent/models.json
          types.ts        # ModelInfo type
        sessions/         # Session persistence
          router.ts       # tRPC router
          service.ts     # Session CRUD and history (session-map.json)
          types.ts       # Session types
      shared/             # Logger, tRPC init
      middlewares/        # Express middleware (response, error, request log)
      config/             # Environment configuration
      expose.ts           # Public type exports for frontend
      router.ts           # Root tRPC router composition
      app.ts              # Express app creation
      index.ts            # Server entry point
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
- **Package Manager**: Strictly use `bun` as the package manager. `pnpm`, `npm`, or `yarn` should not be used
- **Dependencies**: Bun workspace 自动管理共享依赖版本
- **Dependencies**: 严格按需引入依赖。严禁安装当前未使用的依赖（例如：在使用 TipTap 时，仅在真正用到某个特定插件时才进行安装，未使用到的插件绝对不要提前引入或安装）
- **Testing**: Root `vitest.config.ts` uses workspace mode; each package has its own `vitest.config.ts`
- **Production build**: Server uses `packages/server/tsconfig.build.json` (excludes tests)

## Agent Runtime (Bun Side)

The `AgentRuntime` class in `packages/app/src/bun/agent-runtime.ts` manages:
- **Sessions**: Creates/manages per-session `Agent` instances using `@mariozechner/pi-agent-core`
- **Tools**: Built-in tools (fs read/write, terminal) + extension tools
- **Permissions**: `PermissionService` blocks high-risk operations until user approves
- **Extensions**: `ExtensionRegistry` discovers and loads extensions from `~/.pi/agent/extensions/`
- **Models**: `ModelService` resolves model config from `ModelRegistry`

### Permission System

High-risk operations (defined in `PermissionService.isHighRisk()`) require user approval:
1. Tool call triggers permission check
2. UI shows permission dialog via `sessionRequestPermission` event
3. User approves/rejects via `permissionApprove` / `permissionReject` RPC

### Extension System

Extensions are discovered from `~/.pi/agent/extensions/` and loaded via `ExtensionRegistry`:
- Each extension can provide tools and metadata
- Extensions are loaded at startup via `loadAllExtensions()`

## MVP Status

The project is in MVP development. Current state:
- Monorepo scaffolding and tooling are set up
- Server has Express + tRPC skeleton with sessions and models routers
- App has electrobun + React shell with dark theme workspace UI
- Agent runtime, permission system, and extension system are implemented
- Session management, model selection, and permission approval flows are wired up
