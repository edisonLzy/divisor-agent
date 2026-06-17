import path from "path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: path.resolve(__dirname, "src/main/index.ts"),
        formats: ["es"],
      },
      // Workspace packages under `@divisor-agent/*` are source-only (no build
      // step); their `package.json` `exports` point at `.ts` files. Node ESM
      // cannot load `.ts` natively, and no tsx loader is registered for the
      // spawned Electron process in dev mode — so any externalized workspace
      // import would fail with `ERR_MODULE_NOT_FOUND` at runtime. We must
      // bundle them into the main output instead of letting electron-vite
      // externalize them by default.
      //
      // ⚠️ When adding a new workspace package that the main process imports,
      // add its name to the `exclude` list below. `externalizeDeps.exclude`
      // accepts string package names only (no regex); see CLAUDE.md.
      externalizeDeps: {
        exclude: [
          "@divisor-agent/extension-core",
          "@divisor-agent/extension-example",
          "@divisor-agent/extension-subagents",
        ],
      },
    },
  },
  preload: {},
  renderer: {
    root: "src/renderer",
    resolve: {
      alias: {
        "@renderer": path.resolve(__dirname, "src/renderer"),
        "@shared": path.resolve(__dirname, "src/shared"),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
