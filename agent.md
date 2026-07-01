# Agent Guidelines

## Extension Package Directory Structure

Every extension package follows this standard layout:

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
- Tests follow the same three-level structure: `__tests__/common/`, `__tests__/main/`, `__tests__/renderer/`.
