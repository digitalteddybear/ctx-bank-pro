import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default defineConfig([
  ...tseslint.configs.recommended,
  nextPlugin.configs["core-web-vitals"],
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".next-*/**",
    ".next-ui-check/**",
    "dist/**",
    "node_modules/**",
    "coverage/**",
    "data/generated/**",
    "src/vendor/netron/*.js",
  ]),
]);
