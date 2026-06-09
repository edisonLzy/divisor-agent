<div id="top">

<!-- HEADER STYLE: MODERN -->
<div align="center">

<br>

# Divisor Agent

> A desktop-native AI agent runtime for Electron — bridging AI models with your local filesystem and terminal.

[![Electron][electron-badge]][electron-url]
[![React][react-badge]][react-url]
[![TypeScript][typescript-badge]][typescript-url]
[![Vite][vite-badge]][vite-url]
[![Tailwind CSS][tailwind-badge]][tailwind-url]
[![Vitest][vitest-badge]][vitest-url]

[electron-badge]: https://img.shields.io/badge/Electron-47848F.svg?style=flat&logo=Electron&logoColor=white
[react-badge]: https://img.shields.io/badge/React-61DAFB.svg?style=flat&logo=React&logoColor=black
[typescript-badge]: https://img.shields.io/badge/TypeScript-3178C6.svg?style=flat&logo=TypeScript&logoColor=white
[vite-badge]: https://img.shields.io/badge/Vite-646CFF.svg?style=flat&logo=Vite&logoColor=white
[tailwind-badge]: https://img.shields.io/badge/Tailwind%20CSS-06B6D4.svg?style=flat&logo=TailwindCSS&logoColor=white
[vitest-badge]: https://img.shields.io/badge/Vitest-6E9F18.svg?style=flat&logo=Vitest&logoColor=white
[electron-url]: https://www.electronjs.org/
[react-url]: https://react.dev/
[typescript-url]: https://www.typescriptlang.org/
[vite-url]: https://vitejs.dev/
[tailwind-url]: https://tailwindcss.com/
[vitest-url]: https://vitest.dev/

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Data Flow](#-data-flow)
- [IPC Channels](#-ipc-channels)
- [State Management](#-state-management)
- [Status](#-status)
- [Contributing](#-contributing)
- [License](#-license)

---

## 📖 Overview

Divisor Agent is a desktop AI assistant application built on **Electron 39** + **React 19**, featuring a fully integrated AI agent runtime powered by `@mariozechner/pi-agent-core`. It enables AI models to directly interact with the local filesystem and terminal through a permission-controlled tool system, all within a polished desktop UI.

The application follows a **Client/Server hybrid architecture**:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Renderer** | React 19 + Tailwind CSS 4 | Chat UI, session management, permission panels |
| **Main Process** | Electron 39 + Agent Runtime | Agent execution, tool orchestration, IPC bridge |
| **Server** | Express 5 + tRPC (in progress) | Session persistence, model configuration |

Currently the client operates as a standalone desktop app; the server layer is under active development for session persistence and model configuration management.

---

## ✨ Features

### 🤖 AI Agent Runtime
- Powered by `@mariozechner/pi-agent-core`, supporting multi-turn conversations and tool calling
- Seamless integration with multiple AI providers via a flexible model registry
- Streaming responses with real-time thinking process display

### 🛠️ Local Tool System
- **Read File** (medium risk) — Read any file from the local filesystem
- **Write File** (high risk) — Write content to local files
- **Terminal** (high risk) — Execute shell commands with dangerous command detection (e.g., `rm -rf /`)

### 🔒 Permission Control System
- **Real-time permission requests** — Pop-up approval dialogs for sensitive operations
- **"Remember this command"** — Auto-approve by command prefix
- **Permission modes** — Default (per-request approval) / Full Access (auto-approve all)
- **Session-scoped permissions** — Each session maintains its own approval state

### 🧩 Extension System
- Dynamic extension discovery from `~/.pi/extensions/`
- Extension registry with lifecycle management
- Plugin slash commands in the chat editor
- Artifact panel for structured extension output

### 💬 Rich Chat Interface
- **Virtualized message list** — Smooth rendering of long conversations via `@tanstack/react-virtual`
- **Streaming Markdown** — streamdown pipeline with CJK, code blocks, math, and Mermaid diagram support
- **Code highlighting** — Shiki 4 with caching, language selection, and copy buttons
- **Thinking process visualization** — Collapsible panels with timing animations
- **Tool call cards** — Expandable cards showing tool name, status badge, input/output JSON

### 📝 Rich Text Input
- **TipTap editor** (ProseMirror-based) with `@` file search suggestions
- Model selector grouped by provider
- Permission mode selector (Default / Full Access)

### 📂 Session & Workspace Management
- Session sidebar with pinning, workspace/standalone grouping
- Workspace management — create, switch, delete workspaces with custom system prompts
- Multi-session agent pool for concurrent conversations

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron 39 Application                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 Main Process                          │   │
│  │  ┌──────────────┐ ┌────────────┐ ┌───────────────┐   │   │
│  │  │ Agent        │ │ Tools      │ │ Permission     │   │   │
│  │  │ Runtime     │ │ fs/term    │ │ Service        │   │   │
│  │  │ (pi-agent-  │ │            │ │ (request/      │   │   │
│  │  │  core)      │ │            │ │  approve/      │   │   │
│  │  │             │ │            │ │  remember/     │   │   │
│  │  │             │ │            │ │  bypass)       │   │   │
│  │  └──────────────┘ └────────────┘ └───────────────┘   │   │
│  │  ┌──────────────┐ ┌────────────────────────────┐     │   │
│  │  │ Model        │ │ Extension System            │     │   │
│  │  │ Registry     │ │ (discovery / loader / exec) │     │   │
│  │  └──────────────┘ └────────────────────────────┘     │   │
│  └──────────────────────────────────────────────────────┘   │
│                         │ IPC (contextBridge)                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Renderer (React 19)                      │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐   │   │
│  │  │ Chat UI      │ │ Session      │ │ Permission  │   │   │
│  │  │ (virtualized │ │ Sidebar      │ │ Approval    │   │   │
│  │  │  message     │ │ (workspace/  │ │ Panel       │   │   │
│  │  │  list)       │ │  session)    │ │             │   │   │
│  │  └──────────────┘ └──────────────┘ └─────────────┘   │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐   │   │
│  │  │ Markdown     │ │ Code         │ │ Rich Text   │   │   │
│  │  │ (streamdown) │ │ Highlight    │ │ Editor      │   │   │
│  │  │              │ │ (Shiki)      │ │ (TipTap)    │   │   │
│  │  └──────────────┘ └──────────────┘ └─────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Communication Layers

| Direction | Protocol | Purpose |
|-----------|----------|---------|
| Renderer ↔ Main | Electron IPC (contextBridge) | Agent prompt, permissions, model selection |
| App → Server | tRPC (HTTP) | Session metadata, model config |

---

## 🛠️ Tech Stack

### Core

| Category | Technology |
|----------|-----------|
| Framework | Electron 39 + React 19 + Vite 7 |
| Build | electron-vite 5 |
| Styling | Tailwind CSS 4 + shadcn/ui (base-nova) |
| State | Zustand 5 (vanilla stores) |
| Agent | @mariozechner/pi-agent-core 0.68 |
| Validation | Zod 4 + @sinclair/typebox |

### Renderer

| Category | Technology |
|----------|-----------|
| Markdown | streamdown 2 (CJK / code / math / mermaid plugins) |
| Code Highlight | Shiki 4 |
| Rich Text | TipTap 3 + ProseMirror |
| Virtualization | @tanstack/react-virtual 3 |
| Data Fetching | @tanstack/react-query 5 |
| Routing | react-router-dom 7 (memory router) |
| Animation | Framer Motion (motion) |
| Icons | Lucide React |
| Toast | Sonner |

### Server

| Category | Technology |
|----------|-----------|
| Framework | Express 5 |
| API | tRPC 11 + Zod 4 |
| Logging | Pino 9 |

---

## 📂 Project Structure

```text
divisor-agent/
├── commitlint.config.mjs          # Conventional commit linting
├── oxfmt.config.ts                # oxfmt formatter config
├── oxlint.config.ts               # oxlint linter config
├── lint-staged.config.mjs         # Git hooks linting
├── pnpm-workspace.yaml            # pnpm workspace definition
├── vitest.config.ts               # Vitest workspace config
├── CLAUDE.md                      # AI assistant instructions
├── AGENTS.md                      # Agent definitions
├── docs/
│   ├── 需求/                       # Requirements docs (Chinese)
│   ├── 原型/                       # Prototype docs
│   ├── 技术文档/                    # Technical docs
│   └── 调研文档/                    # Research docs
└── packages/
    ├── app/                        # Desktop application
    │   └── src/
    │       ├── main/               # Electron main process
    │       │   ├── index.ts        # Window creation & app entry
    │       │   ├── agent-runtime.ts # Agent runtime (pi-agent-core wrapper)
    │       │   ├── agent-pool.ts   # Multi-session agent manager
    │       │   ├── agent-ipc.ts    # IPC bindings (main ↔ renderer)
    │       │   ├── tools/          # Local tools (fs, terminal)
    │       │   ├── permissions/    # Permission approval service
    │       │   ├── models/         # Model configuration registry
    │       │   └── extensions/     # Extension discovery & loader
    │       ├── preload/            # contextBridge API exposure
    │       ├── renderer/           # React UI
    │       │   ├── App.tsx         # Root component
    │       │   ├── router.tsx      # Route config
    │       │   ├── store/          # Zustand state (3 slices)
    │       │   ├── hooks/          # React hooks
    │       │   ├── pages/          # Page components
    │       │   │   └── workspace/  # Main workspace layout
    │       │   │       ├── chat/           # Chat container, messages, input
    │       │   │       ├── sessions/       # Session sidebar
    │       │   │       └── ...             # Supporting components
    │       │   └── components/     # Shared components
    │       │       ├── ai-elements/ # Message, code block, tool cards
    │       │       ├── richtext/    # ProseMirror rich text components
    │       │       └── ui/         # 25+ shadcn/ui components
    │       └── shared/             # IPC type definitions
    ├── extension-core/             # Extension system core library
    └── extensions/
        └── example/                # Example extension
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 22+
- **pnpm** (strictly required — see below)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/divisor-agent.git
cd divisor-agent

# Install dependencies (pnpm only)
pnpm install
```

### Development

```bash
# Start all packages in parallel
pnpm dev

# Start only the Electron app
pnpm dev:app

# Start only the server (Express + tRPC)
pnpm dev:server
```

### Testing

```bash
# Run all tests
pnpm test

# Run a single test file
pnpm vitest run packages/app/__tests__/xxx.test.ts
```

### Other Commands

```bash
pnpm build              # Build all packages
pnpm type-check         # Type-check all packages
pnpm lint               # Lint (oxlint)
pnpm format             # Auto-format (oxfmt)
pnpm format:check       # Check formatting
pnpm clean              # Clean all node_modules
```

---

## 🔄 Data Flow

```
User Input → PromptEditor (TipTap)
  → handleSubmit()
  → IPC invoke("prompt", sessionId, text, model)
  → AgentPool.prompt() → AgentRuntime.prompt()
  → Agent.prompt() execution begins

Agent emits events:
  agent_start                 → IPC → useAgentMessages → store.setSessionStatus("running")
  message_start/update/end    → IPC → store.appendMessageEntry / updateMessageEntry
  tool_execution_start/update → IPC → store.setToolState
  permission_requested        → IPC → store.enqueuePermissionRequest → UI dialog
  agent_end                   → IPC → store.setSessionStatus("completed")
```

---

## 📡 IPC Channels

### Main → Renderer (Events)

| Channel | Description |
|---------|-------------|
| `agent_start` | Agent begins processing |
| `turn_start` | New turn started |
| `message_start` | Message stream started |
| `message_update` | Message delta received |
| `message_end` | Message complete |
| `tool_execution_start` | Tool execution began |
| `tool_execution_update` | Tool execution progress |
| `tool_execution_end` | Tool execution complete |
| `agent_end` | Agent finished processing |
| `permission_requested` | Permission dialog needed |

### Renderer → Main (Invoke)

| Channel | Description |
|---------|-------------|
| `setModel` | Select AI model |
| `getAvailableModels` | List available models |
| `prompt` | Send user prompt |
| `abortPrompt` | Cancel current generation |
| `setHistoryMessages` | Restore session history |
| `setSessionId` | Switch active session |
| `searchWorkspaceFiles` | Search files via @ mention |
| `setPermissionMode` | Change permission mode |
| `resolvePermissionRequest` | Approve/deny permission |

---

## 🗄️ State Management

Uses **Zustand 5** with a single store composed of three slices:

- **sessionsSlice** — Session list, active session, model assignment, workspace management
- **entriesSlice** — Message entries (streaming append/update), tool execution states
- **permissionSlice** — Permission mode per session, permission request queue, approved requests

---

## 📊 Status

### ✅ Completed

- Electron 39 desktop app (frameless window, vibrancy, frosted glass)
- pi-agent-core runtime integration
- Local tools: read file, write file, terminal execution
- Permission control system (request / approve / reject / remember / bypass)
- Model registry (reads `~/.pi/agent/models.json`)
- Extension discovery & loading infrastructure
- Type-safe IPC bridge (contextBridge + channel whitelist)
- Chat UI:
  - Virtualized message list (@tanstack/react-virtual)
  - Streaming assistant responses (streamdown + CJK / code / math / Mermaid)
  - Thinking process display (collapsible + timing animation)
  - Tool call cards (status badge, input/output JSON)
- TipTap rich text editor with @ file search
- Model selector grouped by provider
- Permission mode selector
- Session sidebar (pinned / workspace / standalone groups)
- Workspace CRUD with custom system prompts
- Zustand state management (3 slices)
- Event subscription system (IPC events → Store auto-sync)
- Shiki code highlighting (cache + language select + copy)
- Plugin system (slash commands, artifact panel, prompt ghost)

### 🏗️ In Progress

- Server package (Express 5 + tRPC + session persistence)
- Extension runtime integration with agent pipeline
- Session branching / Fork functionality
- Settings page

---

## 🤝 Contributing

Contributions are welcome! Please follow our commit conventions:

```bash
# Commit using conventional commits format
git commit -m "feat: add new feature"
git commit -m "fix: resolve issue with..."
git commit -m "refactor: improve structure of..."
```

The project uses:
- **oxlint** for linting (not ESLint)
- **oxfmt** for auto-formatting
- **commitlint** for conventional commit enforcement
- **Husky** + **lint-staged** for pre-commit checks

---

## 📄 License

Distributed under the ISC License. See `LICENSE` for more information.

---

<p align="center">
  <sub>Generated with <a href="https://github.com/eli64s/readme-ai">readme-ai</a> · Built with ❤️</sub>
</p>
