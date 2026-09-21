// packages/http/src/index.ts

/**
 * Public API of the shared MailShrimp HTTP package.
 *
 * I export shared HTTP primitives through this entry point instead of making
 * consumers depend on the package's internal directory structure.
 *
 * This keeps the public API explicit and allows the internal implementation
 * of the package to evolve without requiring changes in every consuming
 * application or microservice.
 */
export { HttpStatus } from "./http-status.js";