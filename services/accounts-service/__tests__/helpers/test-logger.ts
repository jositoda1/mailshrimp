// services/accounts-service/__tests__/helpers/test-logger.ts

import { Buffer } from "node:buffer";
import { Writable } from "node:stream";

import { type Logger } from "pino";

import { createLogger } from "../../src/logging/logger.js";

/**
 * Represents an isolated logger used by automated tests.
 *
 * I capture the real Pino output in memory instead of disabling logging. This
 * means tests can remain quiet while still exercising the same logger
 * configuration used by the application.
 */
export interface TestLogger {
  logger: Logger;
  getOutput: () => string;
}

/**
 * Creates a Pino logger whose output is stored in memory.
 *
 * I keep this helper inside the test suite because capturing logs is a testing
 * concern and must not become part of the production application.
 */
export function createTestLogger(): TestLogger {
  let output = "";

  const destination = new Writable({
    write(chunk: unknown, _encoding, callback) {
      /**
       * I explicitly narrow the stream chunk instead of using `any` so the
       * helper follows the same strict TypeScript and ESLint rules as the
       * production source code.
       */
      if (typeof chunk === "string") {
        output += chunk;
        callback();
        return;
      }

      if (Buffer.isBuffer(chunk)) {
        output += chunk.toString("utf8");
        callback();
        return;
      }

      callback(
        new TypeError(
          `Unexpected logger output chunk type: ${typeof chunk}`,
        ),
      );
    },
  });

  return {
    logger: createLogger(destination),
    getOutput: () => output,
  };
}