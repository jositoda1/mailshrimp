import request from "supertest";
import { HttpStatus } from "@mailshrimp/http";

import { createApp } from "../src/app.js";
import { createTestLogger } from "./helpers/test-logger.js";

describe("GET /health", () => {
  it("returns the health status of the accounts service", async () => {
    /**
     * I inject an in-memory logger so the test exercises normal application
     * logging without writing JSON log entries to the test terminal.
     */
    const { logger } = createTestLogger();
    const app = createApp(logger);

    const response = await request(app).get("/health");

    /**
     * I use the shared HTTP status enum in assertions so the expected protocol
     * meaning and numeric value remain explicit in tests as well as production
     * code.
     */
    expect(response.status).toBe(HttpStatus.OK_200);

    expect(response.body).toEqual({
      status: "ok",
      service: "accounts-service",
    });
  });

  it("does not disclose the Express framework in response headers", async () => {
    /**
     * I inject the same in-memory logger used by the other application tests
     * so this request exercises the real application configuration without
     * writing operational logs to the test terminal.
     */
    const { logger } = createTestLogger();
    const app = createApp(logger);

    const response = await request(app).get("/health");

    /**
     * I verify this explicitly so a future application configuration change
     * cannot silently re-enable Express technology disclosure.
     */
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});