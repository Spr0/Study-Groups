import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.{ts,mjs}", "apps/**/*.test.{ts,mjs}"],
    // Never run copies netlify dev stages under .netlify/functions-serve/.
    exclude: [...configDefaults.exclude, "**/.netlify/**"],
    globals: false,
  },
});
