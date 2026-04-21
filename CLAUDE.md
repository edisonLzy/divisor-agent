# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Divisor-agent is a desktop AI agent app using a C/S hybrid architecture:
- **Server** (`packages/server`): Remote brain — Node.js + Express + tRPC, handles Agent Loop, session storage, LLM calls, and ACP WebSocket server
- **App** (`packages/app`): Local client — Tauri (Rust) + React Webview, handles local FS/terminal execution, ACP communication, and UI rendering

## Common Commands

```bash
bun dev              # Start all packages in parallel
bun dev:server       # Start server only (tsx --watch)
bun dev:app          # Start Tauri app only
bun build            # Build all packages
bun type-check        # Type-check all packages
bun test             # Run all tests (Vitest workspace)
bun lint             # ESLint check
```

Single package commands:
```bash
bun --filter @divisor-agent/server dev
bun --filter @divisor-agent/server test
bun --filter ./packages/app dev
```

Rust (app):
```bash
cd packages/app/src-tauri
cargo check           # Check Rust code
cargo build           # Build Rust
```

## Architecture

### Communication Layers

| Layer | Protocol | Purpose |
|---|---|---|
| Frontend ↔ Server | tRPC (HTTP/SSE) | Session metadata (tree, history), model list |
| Frontend ↔ Rust | Tauri IPC (`invoke`/`listen`) | Commands, permission approval, events |
| Rust ↔ Server | WebSocket (ACP) | Real-time chat stream, tool calls |

### Monorepo Structure

```
packages/
  app/                    # Tauri v2 + React 19 + Vite 7 + Tailwind v4
    src/                  # React frontend
      types/              # Local type definitions (SessionNode, HistoryMessage, etc.)
      components/         # React components (ChatView, SessionTree, MessageBlocks)
      store/              # State management (context + reducer)
      lib/                # Utilities (tRPC client, prosemirror editor)
      pages/              # Page components
    src-tauri/            # Rust core
  server/                 # Express v5 + tRPC + Zod + pino
    src/
      domain/             # Feature modules
        agent/            # ACP WebSocket router + agent service
          router.ts       # WebSocket connection handling
          service.ts     # Agent Loop, tool delegation, permission handling
        sessions/         # Session CRUD and history
          router.ts       # tRPC router
          service.ts      # Session persistence (session-map.json)
          types.ts        # Session types
        models/           # Built-in and custom model configuration
          router.ts       # tRPC router
          service.ts      # Model resolution from ~/.pi/agent/models.json
          types.ts        # ModelInfo type
      shared/             # Logger, tRPC init
      middlewares/        # Express middleware (response, error, request log)
      config/             # Environment configuration
      expose.ts           # Public type exports for frontend
      router.ts           # Root tRPC router composition
      app.ts              # Express app creation
      index.ts            # Server entry point (HTTP + ACP WebSocket)
```

### Key Conventions

- **Server imports**: Always include `.js` extension for local TypeScript imports (ESM requirement)
- **Type imports**: Use `import type { ... }` for pure type imports
- **Dependencies**: Bun workspace 自动管理共享依赖版本
- **Dependencies**: 严格按需引入依赖。严禁安装当前未使用的依赖（例如：在使用 TipTap 时，仅在真正用到某个特定插件时才进行安装，未使用到的插件绝对不要提前引入或安装）。
- **Testing**: Root `vitest.config.ts` uses workspace mode; each package has its own `vitest.config.ts`
- **Production build**: Server uses `packages/server/tsconfig.build.json` (excludes tests)

## Communication Protocol (ACP)

The ACP (Agent Client Protocol) runs over WebSocket between Rust and Server. Key message types:
- Session: `session/start`, `session/prompt`, `session/fork`
- Tools: `fs/read_text_file`, `fs/write_text_file`, `terminal/create`
- Streaming: `agent_message_chunk` with `text_delta` / `thinking_delta`
- Permissions: `session/request_permission`, `permission/approve`, `permission/reject`

## MVP Status

The project is in MVP development. Current state:
- Monorepo scaffolding and tooling are set up
- Server has a basic Express skeleton with a health-check route
- App has a blank Tauri + React shell
- Business capabilities (session tree, ACP tool calls, approval flows, Fork) are in design/implementation phase
