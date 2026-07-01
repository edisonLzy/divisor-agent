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
# Format/lint run automatically via lint-staged on commit; do NOT add
# a repo-wide pnpm format/lint — staged-only is the contract.
```

Single package commands:

```bash
pnpm --filter @divisor-agent/server dev
pnpm --filter @divisor-agent/app dev
pnpm --filter @divisor-agent/server test
```

Run a single test file:

```bash
pnpm vitest run packages/server/__tests__/domain/sessions/service.test.ts
```

## README Generation

README is generated with [readme-ai](https://github.com/eli64s/readme-ai). When the project changes significantly, regenerate it:

```bash
# Ensure readme-ai is installed
pip3 install --user --break-system-packages readmeai

# Ensure .readmeaiignore exists with at minimum:
#   node_modules/
#   .pnpm-store/
#   .git/
#   .DS_Store
#   pnpm-lock.yaml
#   package-lock.json

# Regenerate README (offline/template mode — no API key needed)
export PATH="$HOME/Library/Python/3.14/bin:$PATH"
readmeai \
  --api offline \
  --emojis default \
  --header-style modern \
  --align center \
  --badge-style flat \
  --badge-color "6366f1" \
  --navigation-style bullet \
  --tree-max-depth 3 \
  -r /Users/evan/Desktop/coding/divisor-agent \
  -o /Users/evan/Desktop/coding/divisor-agent/README.md
```

**Important notes:**

- The `--api offline` mode generates a skeleton with badges, project tree, and template sections — but Overview, Features, and Roadmap sections are left empty/placeholder. After running readme-ai, **manually fill in** those sections with accurate project content (architecture, features, tech stack, commands, etc.).
- The `.readmeaiignore` file prevents `node_modules` from being scanned, which would otherwise balloon the README to hundreds of megabytes.
- The project uses **pnpm** — after generation, fix any references that readme-ai incorrectly defaults to `npm` in the Quickstart section.

## Architecture

### Communication Layers

| Layer                    | Protocol                     | Purpose                                      |
| ------------------------ | ---------------------------- | -------------------------------------------- |
| Frontend ↔ Electron Main | Electron IPC (contextBridge) | Agent prompt, permissions, model selection   |
| Frontend ↔ Server        | tRPC (HTTP)                  | Session metadata (tree, history), model list |
| Electron Main ↔ Server   | HTTP/tRPC                    | Session persistence, model config            |

### Key Architectural Patterns

**tRPC Router**: Root router at `packages/server/src/router.ts` composes domain routers. Currently only `sessionsRouter`. Server uses `superjson` transformer. Client at `packages/app/src/renderer/lib/trpc.ts` connects to `http://localhost:3000/trpc` (configurable via `VITE_SERVER_URL`).

**Agent Runtime** (`packages/app/src/main/agent-runtime.ts`): Extends `Emittery`, orchestrates `@mariozechner/pi-agent-core`. Manages sessions, tools (fs read/write, terminal), permissions, extensions, and models. Events flow: Agent → Emittery → `agent-ipc.ts` → `webContents.send()` → renderer.

**IPC Bridge**: Preload script exposes typed `invoke`/`on` via `contextBridge`. Channel whitelists in `packages/app/src/shared/events-ipc.ts`. 10 main→renderer events (agent lifecycle), 6 renderer→main invocations (prompt, model, session).

**State Management**: Two Zustand stores — `useAgentStore` (React hook, `isProcessing`) and `sessionStore` (vanilla store, entries/toolStates/streaming). Session data persisted server-side via tRPC; renderer hydrates on session select.

**Session Tree**: Server stores entries in a tree with `parentId` links, supporting branching/rewind via `setLeaf`/`rewind` mutations.

### UI Component Library

shadcn/ui (base-nova style) with 25+ components in `packages/app/src/renderer/components/ui/`. Rich text input via TipTap 3.x with @-mention file search. Messages rendered via streamdown (streaming markdown with CJK, code, math, mermaid support). Chat messages virtualized via `@tanstack/react-virtual`.

## Key Conventions

- **Server imports**: Always include `.js` extension for local TypeScript imports (ESM requirement)
- **Workspace (source-only) package imports**: Packages like `@divisor-agent/extension-core` have no `tsc` build step and are bundled directly by Vite. Use **no extension** in relative imports (`import "./bridge"`, not `import "./bridge.js"`). Writing `.js` will not match any on-disk file at runtime and breaks the source-direct `exports` resolution.
- **Type imports**: Use `import type { ... }` for pure type imports
- **React imports**: React 19 + new JSX Runtime — do NOT manually `import React from 'react'` in `.tsx`/`.jsx` files
- **React memo hooks**: Do not use `useMemo` or `useCallback` unless the user explicitly asks for them
- **Package Manager**: Strictly use `pnpm`. Use `pnpx` instead of `npx`
- **Node Linker**: `nodeLinker=hoisted` in `.npmrc` for flat `node_modules`
- **Dependencies**: Strictly on-demand. Never install unused dependencies
- **Linting/Formatting**: oxlint (not ESLint) + oxfmt. Config at `oxlint.config.ts` and `oxfmt.config.ts`
- **Git Hooks**: Husky + lint-staged runs `oxlint --fix` and `oxfmt --write` on staged files. Commitlint enforces conventional commits (header/body length unrestricted)
- **Pre-commit dev doc check**: Before staging or committing code changes, **ask the user** whether they want a development document created under `docs/开发文档/`. The dev doc records the *Why* and *How* of the change, with extra weight on architectural / decision-driven shifts. Use the file naming pattern `docs/开发文档/<topic>-<YYYY-MM-DD>.md`. If the user declines or the change is trivial (typo, single-line fix, dependency auto-bump), skip the doc. Do not auto-create without asking.
- **Testing**: Vitest 4.x workspace mode. Each package has `vitest.config.ts` with `__tests__/` directory. Tests use `vi.mock()` with hoisted mocks
- **Production build**: Server uses `packages/server/tsconfig.build.json` (excludes tests)
- **No barrel-export files**: Do **not** create `index.ts` files whose only job is to re-export from sibling modules (`export * from "./foo"; export * from "./bar"`). Barrels hurt tree-shaking, hide the real dependency graph, and silently bloat bundles when a single symbol is imported. An `index.ts` containing **actual implementation** (e.g. `src/helper/index.ts` exporting `parseFileHref`) is fine — that's the canonical module file, not a barrel. If a directory grows and you need multiple files, **callers must import the specific file** (`import { parseFileHref } from "../helper/parse-file-href"`), not the directory. Package-level `package.json` `exports` entries (e.g. `"./renderer": "./src/renderer.tsx"`) are single-file mappings, not barrels — those stay.
- **Package layout — public exports live at `src/` root, internals live in subdirectories**: A workspace package's outward-facing files (the ones listed under `package.json` `exports`) should sit directly under `src/` as flat files; everything else belongs in a named subdirectory. This makes the public surface scannable at a glance — anything in `src/` root is reachable from outside, anything in a subdirectory is internal. See `packages/extension-files/src/` for the canonical layout: `main.ts` / `renderer.tsx` at the root (the two `exports` entries), with `common/`, `renderer/` as internal modules.
- **Extension package directory structure**: Every extension package follows this standard layout:

  ```
  src/
    common/         # shared between main & renderer: meta constants, IPC type definitions, pure helpers
    main/           # main-process internal modules (optional — omit for simple extensions)
    renderer/       # renderer-process internal modules: components, hooks (optional — omit for simple extensions)
    main.ts         # main expose file (defineMainExtension call)
    renderer.tsx    # renderer expose file (defineRendererExtension call)
  ```

  - `common/` — code shared across processes. No Electron or React dependencies.
  - `main/` — Node.js / Electron main-process internals. Only needed when main-side logic grows beyond a single file.
  - `renderer/` — React component internals. Only needed when renderer-side logic grows beyond a single file.
  - Simple extensions (like `extension-example`) can omit `main/` and `renderer/`, with all logic inline in the expose files.
  - `extension-core` is the reference implementation of this layout.
  - **Tests** follow the same three-level structure: `__tests__/common/`, `__tests__/main/`, `__tests__/renderer/` (or `src/__tests__/common/` etc).

### Workspace packages and electron-vite externalization

`@divisor-agent/extension-core` and any other workspace packages are **source-only** — their `package.json` `exports` point at `.ts` files, no `tsc` build step. electron-vite's `externalizeDeps` plugin externalizes every entry in `dependencies` by default, which leaves the main bundle with `import "@divisor-agent/extension-core/main"` statements that Node ESM then tries to resolve to `.ts` source at runtime — and fails with `ERR_MODULE_NOT_FOUND`, because no tsx loader is registered for the spawned Electron process in dev mode.

To keep workspace packages bundled into the main output, list each one explicitly under `build.externalizeDeps.exclude` in `packages/app/electron.vite.config.ts`:

```ts
externalizeDeps: {
  exclude: ["@divisor-agent/extension-core", "@divisor-agent/extension-example"],
}
```

`exclude` accepts string package names only — electron-vite's filter uses `Array.includes()`, regex is not supported. **When adding a new workspace package that the main process imports, add its name to the list above.** The `externalizeDepsPlugin` also emits a `^(pkgA|pkgB|...)/.+` alternation regex covering sub-paths of those packages, but that is handled by the `exclude` strings — no extra config is needed for `package-name/subpath` imports.

## Tech Stack Quick Reference

| Layer         | Key Dependencies                                               |
| ------------- | -------------------------------------------------------------- |
| Server        | Express 5, tRPC 11, Zod 4, Pino 9, Drizzle ORM (not yet wired) |
| App/Build     | Electron 39, electron-vite 5, Vite 7                           |
| App/UI        | React 19, Tailwind CSS 4, shadcn/ui, TipTap 3, Lucide icons    |
| App/State     | Zustand 5, react-router-dom 7 (memory router)                  |
| App/Agent     | @mariozechner/pi-agent-core 0.68, Emittery 2                   |
| App/Rendering | streamdown 2, Shiki 4, @tanstack/react-virtual 3               |
