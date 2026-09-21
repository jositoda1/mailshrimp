/** @type {import("jest").Config} */
module.exports = {
  /**
   * I keep the package tests in the standard MailShrimp __tests__ directory
   * so all workspaces follow the same test organization convention.
   */
  roots: ["<rootDir>/__tests__"],

  /**
   * I use descriptive .test.ts filenames consistently across backend packages
   * and services.
   */
  testMatch: ["**/*.test.ts"],

  /**
   * The package uses native ESM semantics together with TypeScript and
   * NodeNext module resolution.
   */
  extensionsToTreatAsEsm: [".ts"],

  /**
   * ts-jest transforms TypeScript test files while preserving ESM behavior.
   */
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "<rootDir>/tsconfig.json",
      },
    ],
  },

  /**
   * TypeScript NodeNext source imports include the .js extension that will
   * exist after compilation. During Jest execution, this mapping allows those
   * imports to resolve against the original TypeScript source files.
   */
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },

  testEnvironment: "node",

  /**
   * Coverage focuses on production TypeScript source code rather than
   * generated declarations, dependencies, or build output.
   */
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
  ],
  coverageDirectory: "coverage",
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
  ],

  clearMocks: true,
  restoreMocks: true,
};