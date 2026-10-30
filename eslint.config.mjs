import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default defineConfig([
  ...tseslint.configs.recommended,
  nextPlugin.configs["core-web-vitals"],
  globalIgnores([
    ".next/**",
    "dist/**",
    "node_modules/**",
    "coverage/**",
    "data/generated/**",
    "src/vendor/netron/*.js",
  ]),
]);
