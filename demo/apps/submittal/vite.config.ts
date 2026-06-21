import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// Resolve the shared workspace packages from source so Vite bundles them
// directly (no separate build step). Exact-match regex so subpaths like
// "@sg/core/styles.css" still resolve through the package's exports map.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@sg\/core$/, replacement: resolve(here, "../../packages/core/src/index.ts") },
      {
        find: /^@sg\/sample-data$/,
        replacement: resolve(here, "../../packages/sample-data/src/index.ts"),
      },
    ],
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
  },
});
