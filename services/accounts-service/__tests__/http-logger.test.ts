import express, { type Request, type Response } from "express";
import request from "supertest";
import { HttpStatus } from "@mailshrimp/http";

import { createApp } from "../src/app.js";
import { createTestLogger } from "./helpers/test-logger.js";

/**
 * Parses the newline-delimited JSON emitted by Pino.
 *
 * I keep this helper in the HTTP logging test because production logging
 * remains plain structured JSON and does not need test-specific parsing
 * behavior.
 */
function parseLogEntries(output: string): Array<Record<string, unknown>> {
  return output
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("HTTP request logging", () => {
  it("logs method, path, status, duration, and request ID", async () => {
    const { logger, getOutput } = createTestLogger();
    const app = createApp(logger);

    const response = await request(app).get("/health");

    const entries = parseLogEntries(getOutput());

    expect(entries).toHaveLength(1);

    expect(entries[0]).toMatchObject({
      level: 30,
      service: "accounts-service",
      event: "http_request_completed",
      requestId: response.headers["x-request-id"],
      method: "GET",
      path: "/health",
      statusCode: HttpStatus.OK_200,
      msg: "HTTP request completed.",
    });

    expect(entries[0]?.durationMs).toEqual(expect.any(Number));
  });

  it("logs client errors at warn level", async () => {
    const { logger, getOutput } = createTestLogger();
    const app = createApp(logger);

    await request(app).get("/route-that-does-not-exist");

    const entries = parseLogEntries(getOutput());

    expect(entries).toHaveLength(1);

    expect(entries[0]).toMatchObject({
      level: 40,
      event: "http_request_completed",
      method: "GET",
      path: "/route-that-does-not-exist",
      statusCode: HttpStatus.NOT_FOUND_404,
      msg: "HTTP request completed with client error.",
    });
  });

  it("logs server errors at error level", async () => {
    const { logger, getOutput } = createTestLogger();

    /**
     * I create a small isolated Express application for this test because the
     * production application does not yet contain a route that intentionally
     * returns a server error.
     */
    const app = express();
    const productionApp = createApp(logger);

    app.use(productionApp);

    app.get(
      "/test-server-error",
      (_request: Request, response: Response) => {
        response.status(HttpStatus.INTERNAL_SERVER_ERROR_500).json({
          error: "test_error",
        });
      },
    );

    await request(app).get("/test-server-error");

    const entries = parseLogEntries(getOutput());

    expect(entries).toHaveLength(1);

    expect(entries[0]).toMatchObject({
      level: 50,
      event: "http_request_completed",
      method: "GET",
      path: "/test-server-error",
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR_500,
      msg: "HTTP request completed with server error.",
    });
  });

  it("does not include sensitive request headers in HTTP logs", async () => {
    const { logger, getOutput } = createTestLogger();
    const app = createApp(logger);

    await request(app)
      .get("/health")
      .set("Authorization", "Bearer secret-access-token")
      .set("Cookie", "refreshToken=secret-refresh-token");

    const output = getOutput();

    /**
     * HTTP logging deliberately excludes request headers. These assertions
     * protect against accidentally exposing authentication credentials if the
     * HTTP logging implementation is changed later.
     */
    expect(output).not.toContain("secret-access-token");
    expect(output).not.toContain("secret-refresh-token");
  });
});