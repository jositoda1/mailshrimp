// services/accounts-service/__tests__/environment.test.ts

import {
  DEFAULT_PORT,
  getAuthenticationSecrets,
  getPort,
  MIN_AUTH_SECRET_LENGTH,
} from "../src/config/environment.js";

describe("HTTP port configuration", () => {
  /**
   * I verify the default explicitly because port 3111 is part of the current
   * deployment architecture of the accounts service.
   */
  it("uses port 3111 when PORT is not configured", () => {
    expect(getPort(undefined)).toBe(DEFAULT_PORT);
    expect(DEFAULT_PORT).toBe(3111);
  });

  /**
   * Deployment environments must be able to override the default port without
   * requiring a source-code change.
   */
  it("uses a valid port provided by the environment", () => {
    expect(getPort("4000")).toBe(4000);
  });

  /**
   * I test several invalid representations because accepting any of these
   * values could leave the service incorrectly configured or unreachable.
   */
  it.each([
    "",
    "abc",
    "0",
    "-1",
    "65536",
    "3111.5",
  ])("rejects invalid PORT value %j", (configuredPort) => {
    expect(() => getPort(configuredPort)).toThrow(
      `Invalid PORT environment variable: "${configuredPort}". Expected an integer between 1 and 65535.`,
    );
  });

  /**
   * Ports 1 and 65535 are valid boundary values, so I explicitly protect
   * against accidentally rejecting either end of the valid TCP port range.
   */
  it("accepts the lowest valid TCP port", () => {
    expect(getPort("1")).toBe(1);
  });

  it("accepts the highest valid TCP port", () => {
    expect(getPort("65535")).toBe(65535);
  });
});

describe("authentication secret configuration", () => {
  const accessTokenSecret = "a".repeat(MIN_AUTH_SECRET_LENGTH);
  const refreshTokenSecret = "b".repeat(MIN_AUTH_SECRET_LENGTH);

  /**
   * Valid configuration must preserve the exact secret values because the
   * token-signing layer will later consume these values directly.
   */
  it("returns valid and distinct authentication secrets", () => {
    expect(
      getAuthenticationSecrets(accessTokenSecret, refreshTokenSecret),
    ).toEqual({
      accessTokenSecret,
      refreshTokenSecret,
    });
  });

  /**
   * Authentication must not start without both signing credentials. Failing
   * during configuration is safer than discovering the problem when a user
   * attempts to sign in or refresh a session.
   */
  it("rejects a missing access-token secret", () => {
    expect(() =>
      getAuthenticationSecrets(undefined, refreshTokenSecret),
    ).toThrow("Invalid ACCESS_TOKEN_SECRET environment variable.");
  });

  it("rejects a missing refresh-token secret", () => {
    expect(() =>
      getAuthenticationSecrets(accessTokenSecret, undefined),
    ).toThrow("Invalid REFRESH_TOKEN_SECRET environment variable.");
  });

  /**
   * I protect the minimum length boundary explicitly so an accidental policy
   * change becomes visible in the test suite.
   */
  it("rejects authentication secrets shorter than the minimum length", () => {
    const tooShort = "a".repeat(MIN_AUTH_SECRET_LENGTH - 1);

    expect(() =>
      getAuthenticationSecrets(tooShort, refreshTokenSecret),
    ).toThrow("Invalid ACCESS_TOKEN_SECRET environment variable.");

    expect(() =>
      getAuthenticationSecrets(accessTokenSecret, tooShort),
    ).toThrow("Invalid REFRESH_TOKEN_SECRET environment variable.");
  });

  it("accepts authentication secrets exactly at the minimum length", () => {
    expect(
      getAuthenticationSecrets(accessTokenSecret, refreshTokenSecret),
    ).toEqual({
      accessTokenSecret,
      refreshTokenSecret,
    });
  });

  /**
   * Access and refresh credentials must remain independent even when both
   * supplied values individually satisfy the minimum-length requirement.
   */
  it("rejects reuse of the same secret for access and refresh tokens", () => {
    expect(() =>
      getAuthenticationSecrets(accessTokenSecret, accessTokenSecret),
    ).toThrow(
      "ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must use different values.",
    );
  });

  /**
   * Error messages must never echo authentication credentials because startup
   * errors can be captured by CI, process-manager, or production logs.
   */
  it("does not expose an invalid secret in the error message", () => {
    const invalidSecret = "do-not-leak-this-secret";

    expect(() =>
      getAuthenticationSecrets(invalidSecret, refreshTokenSecret),
    ).toThrow(
      `Invalid ACCESS_TOKEN_SECRET environment variable. Expected a secret containing at least ${MIN_AUTH_SECRET_LENGTH} characters.`,
    );

    try {
      getAuthenticationSecrets(invalidSecret, refreshTokenSecret);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(invalidSecret);
    }
  });
});