import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.{ts,mjs}", "apps/**/*.test.{ts,mjs}"],
    globals: false,
  },
});
