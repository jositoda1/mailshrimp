/** @type {import('jest').Config} */
module.exports = {
  // I keep all automated tests inside the __tests__ directory.
  roots: ["<rootDir>/__tests__"],

  // I use descriptive *.test.ts filenames inside __tests__.
  testMatch: ["**/*.test.ts"],

  // TypeScript test files are executed as ES modules.
  extensionsToTreatAsEsm: [".ts"],

  // I use ts-jest so Jest can execute the TypeScript test suite
  // while preserving the ESM module model used by the service.
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "<rootDir>/tsconfig.json",
      },
    ],
  },

  // NodeNext source imports use the .js extension that will exist after
  // compilation. During tests, Jest maps those imports back to TypeScript.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },

  // The accounts service runs in Node.js rather than a browser.
  testEnvironment: "node",

  // Coverage is generated from application code, not from test files.
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
  ],

  coverageDirectory: "coverage",

  // These directories contain generated or third-party code.
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
  ],

  clearMocks: true,
  restoreMocks: true,
};