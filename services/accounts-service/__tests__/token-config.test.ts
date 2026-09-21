// services/accounts-service/__tests__/token-config.test.ts

import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_TTL_SECONDS,
} from "../src/auth/token-config.js";

describe("authentication token configuration", () => {
  it("uses a short lifetime for access tokens", () => {
    /**
     * I test the explicit security decision instead of merely checking that
     * the value is positive. An accidental increase in access-token lifetime
     * should therefore require an intentional test and documentation change.
     */
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(15 * 60);
  });

  it("uses the configured seven-day refresh-token lifetime", () => {
    /**
     * Refresh-token lifetime is part of the authentication/session policy, so
     * changing it should be a deliberate decision visible in the test suite.
     */
    expect(REFRESH_TOKEN_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
  });

  it("keeps the refresh cookie lifetime synchronized with the token lifetime", () => {
    /**
     * Browser cookie maxAge uses milliseconds. This assertion protects the
     * conversion and prevents the cookie and refresh token from accidentally
     * receiving different effective lifetimes.
     */
    expect(REFRESH_TOKEN_COOKIE_MAX_AGE_MS).toBe(
      REFRESH_TOKEN_TTL_SECONDS * 1000,
    );
  });

  it("uses a dedicated refresh-token cookie name", () => {
    /**
     * Keeping the cookie name stable matters when the server later needs to
     * create, read, rotate, and clear the same authentication cookie.
     */
    expect(REFRESH_TOKEN_COOKIE_NAME).toBe("mailshrimp_refresh_token");
  });
});