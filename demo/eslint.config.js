import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // The RFI app (app/) is a separate, untouched plain-JS app with its own
    // conventions; it is not part of this workspace and is left alone.
    ignores: ["**/dist/**", "**/node_modules/**", "**/.netlify/**", "**/coverage/**", "app/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      // TypeScript resolves identifiers, so the core no-undef rule only produces
      // false positives on DOM/Node globals here.
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
);
