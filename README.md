<div id="top">

<!-- HEADER STYLE: MODERN -->
<div align="center">

<br>

# Divisor Agent

> A desktop-native AI agent runtime for Electron — bridging AI models with your local filesystem, terminal, and tool-capable extensions.

[![Electron][electron-badge]][electron-url]
[![React][react-badge]][react-url]
[![TypeScript][typescript-badge]][typescript-url]
[![Vite][vite-badge]][vite-url]
[![Tailwind CSS][tailwind-badge]][tailwind-url]
[![Vitest][vitest-badge]][vitest-url]
[![pnpm][pnpm-badge]][pnpm-url]

[electron-badge]: https://img.shields.io/badge/Electron-47848F.svg?style=flat&logo=Electron&logoColor=white
[react-badge]: https://img.shields.io/badge/React-61DAFB.svg?style=flat&logo=React&logoColor=black
[typescript-badge]: https://img.shields.io/badge/TypeScript-3178C6.svg?style=flat&logo=TypeScript&logoColor=white
[vite-badge]: https://img.shields.io/badge/Vite-646CFF.svg?style=flat&logo=Vite&logoColor=white
[tailwind-badge]: https://img.shields.io/badge/Tailwind%20CSS-06B6D4.svg?style=flat&logo=TailwindCSS&logoColor=white
[vitest-badge]: https://img.shields.io/badge/Vitest-6E9F18.svg?style=flat&logo=Vitest&logoColor=white
[pnpm-badge]: https://img.shields.io/badge/pnpm-F69220.svg?style=flat&logo=pnpm&logoColor=white
[electron-url]: https://www.electronjs.org/
[react-url]: https://react.dev/
[typescript-url]: https://www.typescriptlang.org/
[vite-url]: https://vitejs.dev/
[tailwind-url]: https://tailwindcss.org/
[vitest-url]: https://vitest.dev/
[pnpm-url]: https://pnpm.io/

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
- [Extensions](#-extensions)
- [Status](#-status)
- [Contributing](#-contributing)
- [License](#-license)

---

## 📖 Overview

**Divisor Agent** is a desktop AI assistant application built on **Electron 39** + **React 19**, with an agent runtime powered by [`@earendil-works/pi-agent-core`](https://www.npmjs.com/package/@earendil-works/pi-agent-core). It lets AI models directly interact with the local filesystem and terminal through a permission-controlled tool system, and exposes its own surface for first-class extensions (file system, sub-agents, etc.).

The application follows a **client/local-runtime hybrid**:

| Layer                | Technology                                            | Purpose                                                                 |
| -------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| **Renderer**         | React 19 + Tailwind CSS 4 + base-ui                   | Chat UI, session/workspace management, permission panels, settings      |
| **Electron Main**    | Electron 39 + agent runtime                           | Agent execution, tool orchestration, permission service, IPC bridge     |
| **Workspace pkgs**   | `@divisor-agent/extension-*`                          | First-class extensions (files, sub-agents, examples) bundled into main  |
| **Remote session API** | REST (`/v1/agent/*` via `axios`)                     | Session / workspace / entry persistence, branching, rewind              |

The app is delivered as a single Electron desktop binary. Session, workspace, and entry data are persisted by a remote HTTP service (see `packages/app/src/renderer/apis/sessions.ts`); the renderer hydrates from that service on session select and the agent runtime streams events back over IPC.

---

## ✨ Features

### 🤖 AI Agent Runtime

- Built on `@earendil-works/pi-agent-core` 0.74, supporting multi-turn conversations and tool calling
- Pluggable model registry that reads `~/.pi/agent/models.json`
- Streaming responses with real-time thinking-process display

### 🛠️ Local Tool System

- **Read / Write file** — Read and write any file from the local filesystem
- **Terminal** — Execute shell commands with dangerous-command detection
- Per-tool risk classification feeding the permission service

### 🔒 Permission Control System

- **Real-time permission requests** — Pop-up approval dialogs for sensitive operations
- **"Remember this command"** — Auto-approve by command prefix
- **Permission modes** — Default (per-request approval) / Full Access (auto-approve all)
- **Session-scoped permissions** — Each session maintains its own approval state

### 🧩 Extension System

- Workspace packages under `packages/extension-*` discovered and bundled into the main process at build time
- `defineMainExtension` / `defineRendererExtension` contracts from `@divisor-agent/extension-core`
- **Shipped extensions**:
  - `@divisor-agent/extension-example` — minimal reference
  - `@divisor-agent/extension-files` — file-system tools and UI
  - `@divisor-agent/extension-subagents` — sub-agent dispatch
- Slash-command plugins, artifact panel for structured extension output

### 🪟 Tree-Based Session Management

- Sessions stored as a tree with `parentId` / `leafEntryId`, supporting **branching** and **rewind** via `setLeaf`
- **Workspaces** group sessions with a shared system prompt and per-workspace context
- **Pinning** (`isTop`) for sticky sessions and workspaces
- Variant 02 two-line session hierarchy with running / completed / failed status and relative time

### 💬 Rich Chat Interface

- **Virtualized message list** — Smooth rendering of long conversations via `@tanstack/react-virtual`
- **Streaming Markdown** — streamdown 2 with CJK, code blocks, math, and Mermaid diagram support
- **Code highlighting** — Shiki 4 with caching, language selection, and copy buttons
- **Thinking process visualization** — Collapsible panels with timing animations
- **Tool call cards** — Expandable cards showing tool name, status badge, input/output JSON

### 📝 Rich Text Input

- **TipTap 3** (ProseMirror-based) editor with `@` file-search suggestions
- Model selector grouped by provider
- Permission mode selector (Default / Full Access)

### 🧠 Skills

- A first-class **Skills** subsystem alongside prompts and permissions
- `listSkills` / `setSkillEnabled` IPC channels for discovery and toggling

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron 39 Application                   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 Main Process                          │   │
│  │  ┌──────────────┐ ┌────────────┐ ┌───────────────┐   │   │
│  │  │ Agent        │ │ Agent      │ │ Agent         │   │   │
│  │  │ Runtime      │ │ Pool       │ │ IPC           │   │   │
│  │  │ (pi-agent-   │ │ (multi-    │ │ (main ↔       │   │   │
│  │  │  core 0.74)  │ │  session)  │ │  renderer)    │   │   │
│  │  └──────────────┘ └────────────┘ └───────────────┘   │   │
│  │  ┌──────────────┐ ┌────────────┐ ┌───────────────┐   │   │
│  │  │ Permissions  │ │ Models     │ │ Tools         │   │   │
│  │  │ Service      │ │ Registry   │ │ fs / terminal │   │   │
│  │  └──────────────┘ └────────────┘ └───────────────┘   │   │
│  │  ┌──────────────┐ ┌────────────┐ ┌───────────────┐   │   │
│  │  │ System       │ │ Skills     │ │ Extensions    │   │   │
│  │  │ Prompt       │ │ Service    │ │ (workspace    │   │   │
│  │  │ Service      │ │            │ │  packages)    │   │   │
│  │  └──────────────┘ └────────────┘ └───────────────┘   │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │ Browser Window (frameless, vibrancy)         │    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────┘   │
│                         │ IPC (contextBridge)                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Renderer (React 19)                      │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐   │   │
│  │  │ Workspace    │ │ Chat         │ │ Settings    │   │   │
│  │  │ Layout       │ │ (virtualized │ │             │   │   │
│  │  │              │ │  list)       │ │             │   │   │
│  │  └──────────────┘ └──────────────┘ └─────────────┘   │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐   │   │
│  │  │ Sessions     │ │ Permission   │ │ Artifact    │   │   │
│  │  │ Sidebar      │ │ Approval     │ │ Panel       │   │   │
│  │  │ (workspaces/ │ │ Panel        │ │             │   │   │
│  │  │  sessions)   │ │              │ │             │   │   │
│  │  └──────────────┘ └──────────────┘ └─────────────┘   │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │ Zustand stores: main + side-chat (shared     │    │   │
│  │  │ entries-slice factory)                       │    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────┘   │
│                         │ HTTP (axios)                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Remote Session API                       │   │
│  │  /v1/agent/sessions  /v1/agent/workspaces             │   │
│  │  /v1/agent/session/:id/entries  ...  /leaf  /pin      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Communication Layers

| Direction        | Protocol                     | Purpose                                                              |
| ---------------- | ---------------------------- | -------------------------------------------------------------------- |
| Renderer ↔ Main  | Electron IPC (contextBridge) | Agent prompt, permissions, model selection, skills, system queries   |
| Renderer → API   | HTTP (`axios`)               | Session / workspace / entry persistence (`/v1/agent/*`)              |

---

## 🛠️ Tech Stack

### Core

| Category       | Technology                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------- |
| Framework      | Electron 39 + React 19 + Vite 7                                                             |
| Build          | electron-vite 5 + electron-builder                                                          |
| Styling        | Tailwind CSS 4 + `tw-animate-css`                                                           |
| UI primitives  | `@base-ui/react`, Radix (`@radix-ui/react-use-controllable-state`), `cmdk`                  |
| State          | Zustand 5 (one store per session scope; shared `entries-slice` factory)                    |
| Agent runtime  | `@earendil-works/pi-agent-core` 0.74 + `@earendil-works/pi-ai` 0.74                          |
| Validation     | Zod 4                                                                                       |
| Routing        | `react-router-dom` 7 (memory router)                                                        |

### Renderer

| Category       | Technology                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------- |
| Markdown       | `streamdown` 2 with CJK / code / math / Mermaid plugins                                     |
| Code highlight | `shiki` 4                                                                                   |
| Rich text      | TipTap 3 + ProseMirror (`prosemirror-*`) + Tiptap mention / placeholder / suggestion       |
| Virtualization | `@tanstack/react-virtual` 3, `use-stick-to-bottom`                                           |
| Layout         | `react-resizable-panels`, `@dnd-kit/core` / `sortable` / `utilities`, `@xyflow/react`       |
| Animation      | `motion` 12                                                                                 |
| Media          | `media-chrome`, `rive-app/react-webgl2`                                                     |
| Icons          | `lucide-react` 1.x                                                                          |
| Toast          | `sonner`                                                                                    |
| Search         | `fuse.js`, `@floating-ui/dom` + `/react`                                                     |
| Data fetching  | `axios` 1.x (`@renderer/lib/request` + `@renderer/apis/sessions`)                          |
| Hotkeys        | `@tanstack/react-hotkeys`                                                                   |

### Tooling

| Category  | Technology                                                   |
| --------- | ------------------------------------------------------------ |
| Lint      | `oxlint`                                                      |
| Format    | `oxfmt`                                                       |
| Commits   | `commitlint` (conventional) + Husky + lint-staged            |
| Tests     | `vitest` 4.x workspace mode                                   |
| Type-check| `tsc` 5.9 (per package)                                      |
| Pkg mgr   | `pnpm` 11.x with catalog + `nodeLinker=hoisted`              |

---

## 📂 Project Structure

```text
divisor-agent/
├── AGENTS.md                            # Agent guidelines (extension layout, etc.)
├── CLAUDE.md                            # AI assistant instructions
├── commitlint.config.mjs                # Conventional commit linting
├── lint-staged.config.mjs               # Git-hook lint/format contract (staged-only)
├── oxfmt.config.ts                      # oxfmt formatter config
├── oxlint.config.ts                     # oxlint linter config
├── pnpm-workspace.yaml                  # pnpm workspace + catalog + allowBuilds
├── vitest.config.ts                     # Vitest workspace config
├── docs/
│   ├── 需求/                            # Requirements docs (Chinese)
│   ├── 原型/                            # Prototypes + design QAs
│   ├── 调研/                            # Investigation notes
│   ├── 调研文档/                        # Long-form research
│   ├── 技术文档/                        # Technical reference
│   ├── 设计文档/                        # UI design spec (canonical)
│   └── 开发文档/                        # Dev docs (dated; why + how)
└── packages/
    ├── app/                             # Electron desktop app
    │   └── src/
    │       ├── main/                    # Electron main process
    │       │   ├── index.ts             # App entry
    │       │   ├── agent-runtime.ts     # pi-agent-core wrapper
    │       │   ├── agent-pool.ts        # Multi-session manager
    │       │   ├── agent-ipc.ts         # IPC bindings (main ↔ renderer)
    │       │   ├── browser-window/      # Frameless window setup
    │       │   ├── extensions/          # Extension discovery / loader
    │       │   ├── file-system/         # File-system IPC handlers
    │       │   ├── models/              # Model registry
    │       │   ├── permissions/         # Permission service
    │       │   ├── prompt/              # System-prompt service
    │       │   ├── skills/              # Skills service
    │       │   └── tools/               # Local tools (fs, terminal)
    │       ├── preload/                 # contextBridge API exposure
    │       ├── renderer/                # React UI
    │       │   ├── App.tsx              # Root component
    │       │   ├── router.tsx           # Route config (memory)
    │       │   ├── Layout.tsx           # Top-level layout
    │       │   ├── apis/                # Remote HTTP client (sessions.ts)
    │       │   ├── lib/                 # request, clipboard, date, etc.
    │       │   ├── components/          # Shared components
    │       │   ├── context/             # React context providers
    │       │   ├── extensions/          # Renderer-side extension mounts
    │       │   ├── hooks/               # use-agent-* / use-latest / use-subscribe-*
    │       │   ├── pages/               # workspace/, settings/
    │       │   │   └── workspace/       # Main workspace layout
    │       │   │       ├── chat/        # Chat container, messages, input
    │       │   │       ├── sessions/    # Session sidebar (workspaces, sessions)
    │       │   │       ├── use-agent-*.ts
    │       │   │       └── use-window-full-screen.ts
    │       │   ├── plugins/             # Renderer plugin contracts
    │       │   └── store/               # Zustand: main/ + side-chat/ + entries-slice
    │       └── shared/                  # IPC type definitions + channel whitelist
    ├── extension-core/                  # Extension system core library
    ├── extension-example/               # Reference extension
    ├── extension-files/                 # Filesystem-related extension
    └── extension-subagents/             # Sub-agent dispatch extension
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 22+
- **pnpm** 11+ (strictly required — `pnpm-workspace.yaml` uses catalog + allowBuilds)

### Installation

```bash
git clone https://github.com/yourusername/divisor-agent.git
cd divisor-agent
pnpm install
```

### Development

```bash
# Start the Electron app with electron-vite
pnpm dev

# Start only the app (no parallel script)
pnpm dev:app
```

`pnpm dev` resolves to `pnpm run --parallel dev` from the root. The app package's `dev` script runs `electron-vite dev --inspect --sourcemap`; extension workspace packages are bundled in via `build.externalizeDeps.exclude` in `packages/app/electron.vite.config.ts`.

### Testing

```bash
# Run all tests across the workspace
pnpm test

# Run a single test file
pnpm vitest run packages/app/src/renderer/pages/workspace/__tests__/xxx.test.ts
```

### Other Commands

```bash
pnpm build                # Build all packages
pnpm type-check           # Type-check every workspace package
pnpm clean                # Remove all node_modules (root + packages)
# Format/lint run via lint-staged on commit — staged-only by design.
```

---

## 🔄 Data Flow

```
User Input → TipTap PromptEditor
  → handleSubmit()
  → IPC invoke("prompt", sessionId, text, model)
  → AgentPool.prompt() → AgentRuntime.prompt()
  → Agent.prompt() execution begins

Agent emits events (tagged with sessionId + scope):
  agent_start                 → IPC → useSubscribeAgentEvents → store.setSessionStatus("running")
  turn_start / turn_end       → IPC → store
  message_start/update/end    → IPC → entries-slice.append/update
  tool_execution_start/update/end → IPC → entries-slice.setToolState
  permission_requested        → IPC → permission-slice.enqueue → UI dialog
  agent_end                   → IPC → store.setSessionStatus("completed")

Renderer hydrates session list / entries from the remote API
on session select via @renderer/apis/sessions.ts.
```

---

## 📡 IPC Channels

### Main → Renderer (Events)

| Channel                  | Description                |
| ------------------------ | -------------------------- |
| `agent_start`            | Agent begins processing    |
| `agent_end`              | Agent finished processing  |
| `turn_start`             | New turn started           |
| `turn_end`               | Turn finished              |
| `message_start`          | Message stream started     |
| `message_update`         | Message delta received     |
| `message_end`            | Message complete           |
| `tool_execution_start`   | Tool execution began       |
| `tool_execution_update`  | Tool execution progress    |
| `tool_execution_end`     | Tool execution complete    |
| `permission_requested`   | Permission dialog needed   |

### Renderer → Main (Invoke)

| Channel                    | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| `setModel`                 | Select AI model                                      |
| `getAvailableModels`       | List available models                                |
| `getModelConfig`           | Read a single model config                           |
| `saveModelConfig`          | Persist a model config                               |
| `prompt`                   | Send user prompt                                     |
| `clearAllQueues`           | Cancel all queued prompts                            |
| `runOneTimeAgent`          | Fire-and-forget single agent run                     |
| `abortPrompt`              | Cancel current generation                            |
| `setHistoryMessages`       | Restore session history                              |
| `setSessionId`             | Switch active session                                |
| `setSessionScope`          | Switch between main / side-chat scope                |
| `destroySession`           | Tear down a session                                  |
| `setPermissionMode`        | Change permission mode                               |
| `resolvePermissionRequest` | Approve / deny a permission request                  |
| `listSkills`               | List available skills                                |
| `setSkillEnabled`          | Enable / disable a skill                             |
| `fsReadTextFile`           | Read a text file from the local filesystem           |
| `isWindowFullScreen`       | Query the current window fullscreen state            |
| `setWindowControlsTheme`   | Set the macOS traffic-light theme (light / dark)     |

The full whitelist lives in `packages/app/src/shared/events-ipc.ts`. All events are tagged with `scope: "main" | "side-chat"` and `sessionId` so the renderer can route multi-session events to the correct store.

---

## 🗄️ State Management

Renderer state uses **Zustand 5** with two independent stores that share an `entries-slice` factory:

- **`main/`** — Primary session scope (`useMainStore`):
  - `session-slice.ts` — active session, model assignment, workspace
  - `permission-slice.ts` — permission mode, request queue, approved requests
  - `artifact-slice.ts` — generic artifact panel
  - `pending-messages-slice.ts` — optimistic message state
  - `entries-slice.ts` (composed) — message entries, tool states, streaming
- **`side-chat/`** — Sidebar session scope (`useSideChatStore`):
  - `side-chat-slice.ts` — sidebar session metadata
  - `entries-slice.ts` (composed) — same factory, isolated per session

**Why two stores?** Each session scope is an independent IPC routing target (the runtime tags every event with `scope` + `sessionId`); isolating them keeps `removeSession` cheap and subscription granularity tight. `entries-slice.ts` is a **pure factory** that knows nothing about other slices, so both stores can compose it without coupling.

See `packages/app/src/renderer/store/README.md` for the full organization rules.

---

## 🧩 Extensions

Every extension package follows a standard layout (see `AGENTS.md`):

```
src/
  common/         # shared between main & renderer (meta, IPC types, pure helpers)
  main/           # main-process internals (optional)
  renderer/       # renderer-process internals (optional)
  main.ts         # main expose file (defineMainExtension call)
  renderer.tsx    # renderer expose file (defineRendererExtension call)
```

Extension workspace packages are **source-only** — their `package.json` `exports` point at `.ts` files with no `tsc` build step. They are bundled into the main Electron output via `build.externalizeDeps.exclude` in `packages/app/electron.vite.config.ts`. **Any new workspace package imported by the main process must be added to that list** (electron-vite's `exclude` accepts string package names only — no regex).

**Shipped extensions:**

- `@divisor-agent/extension-example` — minimal reference implementation
- `@divisor-agent/extension-files` — file-system tools and renderer surface
- `@divisor-agent/extension-subagents` — sub-agent dispatch and orchestration

---

## 📊 Status

### ✅ Completed

- Electron 39 desktop app (frameless window, vibrancy, fullscreen-aware chrome)
- `@earendil-works/pi-agent-core` 0.74 runtime integration
- Local tools: read file, write file, terminal execution
- Permission control system (request / approve / reject / remember / bypass)
- Model registry (reads `~/.pi/agent/models.json`)
- Extension discovery & loading infrastructure (workspace packages)
- Type-safe IPC bridge (contextBridge + compile-time channel whitelist)
- Chat UI:
  - Virtualized message list (`@tanstack/react-virtual`)
  - Streaming assistant responses (streamdown 2 + CJK / code / math / Mermaid)
  - Thinking-process display (collapsible + timing animation)
  - Tool call cards (status badge, input/output JSON)
- TipTap 3 rich-text editor with `@` file search
- Model selector grouped by provider
- Permission mode selector
- **Tree-based sessions** with `parentId` / `leafEntryId`, branching via `setLeaf`, rewind
- **Workspaces** with shared system prompt and per-workspace context
- **Skills** subsystem (`listSkills` / `setSkillEnabled`)
- **Two-store Zustand layout** (main + side-chat) with shared `entries-slice` factory
- **Remote session API** at `/v1/agent/*` (sessions / workspaces / entries / leaf / pin)
- Session sidebar (Variant 02 two-line hierarchy, status + relative time, inline delete confirm, workspace count)
- Shiki code highlighting (cache + language select + copy)
- Plugin system (slash commands, artifact panel, prompt ghost)
- Window fullscreen detection and adaptive header padding
- Shipped extensions: `extension-example`, `extension-files`, `extension-subagents`

### 🏗️ In Progress

- Settings page wiring
- Session rewind UI surfacing
- Per-workspace context editor
- Broader extension ecosystem (third-party discovery outside `packages/extensions/`)

---

## 🤝 Contributing

Contributions are welcome! Please follow the commit conventions enforced by `commitlint`:

```bash
git commit -m "feat: add new feature"
git commit -m "fix: resolve issue with..."
git commit -m "refactor: improve structure of..."
git commit -m "docs: update README"
```

The project uses:

- **pnpm** workspaces (catalog + `nodeLinker=hoisted`)
- **oxlint** for linting (not ESLint)
- **oxfmt** for auto-formatting
- **commitlint** for conventional commit enforcement
- **Husky** + **lint-staged** for pre-commit checks (staged-only)
- **Vitest** 4.x workspace mode for tests

When adding a new workspace package imported by the main process, register it in `packages/app/electron.vite.config.ts` under `build.externalizeDeps.exclude`.

---

## 📄 License

Distributed under the ISC License. See `LICENSE` for more information.

---

<p align="center">
  <sub>Generated with <a href="https://github.com/eli64s/readme-ai">readme-ai</a> · Built with ❤️</sub>
</p>
