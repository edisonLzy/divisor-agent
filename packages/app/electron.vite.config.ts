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
    },
  },
  preload: {},
  renderer: {
    root: "src/renderer",
    resolve: {
      alias: {
        "@renderer": path.resolve(__dirname, "src/renderer"),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
