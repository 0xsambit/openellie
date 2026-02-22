import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

/** @type {import("eslint").Linter.Config[]} */
export default [
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylistic,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow numbers and booleans in template expressions
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
      // No console.log — use logger
      "no-console": "error",
      // No unused variables (allow underscore-prefixed)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Prefer T[] over Array<T>
      "@typescript-eslint/array-type": ["error", { default: "array" }],
      // Allow require-style imports for compat
      "@typescript-eslint/no-require-imports": "off",
      // Require return types on exported functions (warning only)
      "@typescript-eslint/explicit-module-boundary-types": "warn",
      // Prefer async/await over raw promises
      "@typescript-eslint/prefer-promise-reject-errors": "error",
    },
  },
  {
    // Test files: relax some rules
    files: ["**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/.next/**",
      "**/drizzle/**",
    ],
  },
];
