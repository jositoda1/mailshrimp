// services/accounts-service/__tests__/health.test.ts

import request from "supertest";

import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("returns the health status of the accounts service", async () => {
    const app = createApp();

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "accounts-service",
    });
  });
});