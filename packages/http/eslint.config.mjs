import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    /**
     * Generated files, coverage output, and dependencies are not part of the
     * source-quality checks.
     */
    ignores: ["dist/**", "coverage/**", "node_modules/**"],
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
        /**
         * I use the package TypeScript configuration for type-aware linting so
         * shared code receives the same quality checks as MailShrimp services.
         */
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /**
       * I require explicit function return types where applicable so public
       * package behavior remains clear and intentional.
       */
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
        },
      ],

      /**
       * These rules protect asynchronous code from common mistakes as the
       * shared HTTP package grows in the future.
       */
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      /**
       * I avoid explicit any so shared package types do not weaken type safety
       * in every application that consumes them.
       */
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);
