import request from "supertest";

import { createApp } from "../src/app.js";
import { REQUEST_ID_HEADER } from "../src/middleware/request-context.js";
import { createTestLogger } from "./helpers/test-logger.js";

describe("HTTP request context", () => {
  it("returns a request ID in the response", async () => {
    const { logger } = createTestLogger();
    const app = createApp(logger);

    const response = await request(app).get("/health");

    expect(response.headers[REQUEST_ID_HEADER]).toEqual(expect.any(String));
  });

  it("generates a different request ID for independent requests", async () => {
    const { logger } = createTestLogger();
    const app = createApp(logger);

    const firstResponse = await request(app).get("/health");
    const secondResponse = await request(app).get("/health");

    const firstRequestId = firstResponse.headers[REQUEST_ID_HEADER];
    const secondRequestId = secondResponse.headers[REQUEST_ID_HEADER];

    expect(firstRequestId).toEqual(expect.any(String));
    expect(secondRequestId).toEqual(expect.any(String));
    expect(firstRequestId).not.toBe(secondRequestId);
  });

  it("does not trust a client-supplied request ID", async () => {
    const { logger } = createTestLogger();
    const app = createApp(logger);

    const clientRequestId = "client-controlled-request-id";

    const response = await request(app)
      .get("/health")
      .set(REQUEST_ID_HEADER, clientRequestId);

    expect(response.headers[REQUEST_ID_HEADER]).toEqual(expect.any(String));
    expect(response.headers[REQUEST_ID_HEADER]).not.toBe(clientRequestId);
  });
});