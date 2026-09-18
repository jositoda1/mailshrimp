import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Generated files and dependencies are not part of the source-quality checks.
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
    ],
  },

  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...eslint.configs.recommended,
  },

  {
    files: ["src/**/*.ts", "__tests__/**/*.ts"],

    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
    ],

    languageOptions: {
      parser: tseslint.parser,

      parserOptions: {
        // I use the TypeScript project configuration for type-aware lint rules.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      // Explicit return types make public service behavior easier to understand
      // and reduce accidental changes to exported APIs.
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
        },
      ],

      // Promises must be handled explicitly to avoid silent asynchronous failures.
      "@typescript-eslint/no-floating-promises": "error",

      // Misused promises can cause unexpected behavior in callbacks and conditions.
      "@typescript-eslint/no-misused-promises": "error",

      // The `any` type removes important guarantees from the TypeScript compiler.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);