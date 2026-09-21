// packages/http/__tests__/http-status.test.ts

import { HttpStatus } from "../src/index.js";

describe("HttpStatus", () => {
  /**
   * I verify the successful-response status codes because these numeric values
   * are part of the HTTP contract shared by MailShrimp applications and
   * microservices.
   */
  it("defines the expected successful response status codes", () => {
    expect(HttpStatus.OK_200).toBe(200);
    expect(HttpStatus.CREATED_201).toBe(201);
    expect(HttpStatus.NO_CONTENT_204).toBe(204);
  });

  /**
   * I verify client-error status codes explicitly because validation,
   * authentication, authorization, resource lookup, conflicts, and rate
   * limiting depend on these standard protocol values.
   */
  it("defines the expected client error status codes", () => {
    expect(HttpStatus.BAD_REQUEST_400).toBe(400);
    expect(HttpStatus.UNAUTHORIZED_401).toBe(401);
    expect(HttpStatus.FORBIDDEN_403).toBe(403);
    expect(HttpStatus.NOT_FOUND_404).toBe(404);
    expect(HttpStatus.CONFLICT_409).toBe(409);
    expect(HttpStatus.TOO_MANY_REQUESTS_429).toBe(429);
  });

  /**
   * I verify server-error status codes so accidental changes cannot silently
   * alter the HTTP behavior of every service consuming this shared package.
   */
  it("defines the expected server error status codes", () => {
    expect(HttpStatus.INTERNAL_SERVER_ERROR_500).toBe(500);
    expect(HttpStatus.BAD_GATEWAY_502).toBe(502);
    expect(HttpStatus.SERVICE_UNAVAILABLE_503).toBe(503);
  });
});