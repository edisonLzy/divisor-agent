import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    },
  },
});
