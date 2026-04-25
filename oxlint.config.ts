import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "react", "import"],
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  ignorePatterns: [".agents/**"],
  rules: {
    "no-unused-vars": "warn",
  },
});
