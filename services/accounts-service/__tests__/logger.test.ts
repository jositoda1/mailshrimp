import { Buffer } from "node:buffer";
import { Writable } from "node:stream";

import { createLogger } from "../src/logging/logger.js";

/**
 * Creates an in-memory destination for Pino.
 *
 * I use a Writable stream instead of intercepting console output because the
 * test should exercise Pino's real serialization and redaction behavior.
 */
function createMemoryDestination(): {
  destination: Writable;
  getOutput: () => string;
} {
  let output = "";

  const destination = new Writable({
    write(chunk: unknown, _encoding, callback) {
      /**
       * Node writable streams can receive different chunk representations.
       * I narrow the unknown value explicitly instead of relying on `any`, so
       * the test keeps the same type-safety guarantees as production code.
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
    destination,
    getOutput: () => output,
  };
}

describe("logger", () => {
  it("writes structured JSON with the service name", () => {
    const { destination, getOutput } = createMemoryDestination();
    const testLogger = createLogger(destination);

    testLogger.info(
      {
        event: "test_event",
      },
      "Test log entry",
    );

    const logEntry = JSON.parse(getOutput()) as Record<string, unknown>;

    expect(logEntry).toMatchObject({
      level: 30,
      service: "accounts-service",
      event: "test_event",
      msg: "Test log entry",
    });
  });

  it("redacts sensitive authentication and credential fields", () => {
    const { destination, getOutput } = createMemoryDestination();
    const testLogger = createLogger(destination);

    testLogger.info({
      password: "super-secret-password",
      accessToken: "access-token-value",
      refreshToken: "refresh-token-value",
      clientSecret: "client-secret-value",
      headers: {
        authorization: "Bearer private-access-token",
        cookie: "refreshToken=private-refresh-token",
      },
    });

    const output = getOutput();

    /**
     * I verify both sides of the security requirement:
     *
     * 1. sensitive values must never appear in serialized logs;
     * 2. the configured censor must appear, proving that Pino applied the
     *    redaction policy instead of the test passing because fields vanished
     *    for an unrelated reason.
     */
    expect(output).not.toContain("super-secret-password");
    expect(output).not.toContain("access-token-value");
    expect(output).not.toContain("refresh-token-value");
    expect(output).not.toContain("client-secret-value");
    expect(output).not.toContain("Bearer private-access-token");
    expect(output).not.toContain("refreshToken=private-refresh-token");

    expect(output).toContain("[REDACTED]");
  });

  it("preserves non-sensitive diagnostic context", () => {
    const { destination, getOutput } = createMemoryDestination();
    const testLogger = createLogger(destination);

    testLogger.warn({
      event: "authentication_failed",
      requestId: "request-123",
      method: "POST",
      path: "/auth/login",
      statusCode: 401,
    });

    const logEntry = JSON.parse(getOutput()) as Record<string, unknown>;

    expect(logEntry).toMatchObject({
      level: 40,
      service: "accounts-service",
      event: "authentication_failed",
      requestId: "request-123",
      method: "POST",
      path: "/auth/login",
      statusCode: 401,
    });
  });
});