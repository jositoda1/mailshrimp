// services/accounts-service/__tests__/token-config.test.ts

import {
  DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
  getRefreshTokenCookieMaxAgeMs,
  MAX_ACCESS_TOKEN_TTL_SECONDS,
  MAX_REFRESH_TOKEN_TTL_SECONDS,
  MIN_ACCESS_TOKEN_TTL_SECONDS,
  MIN_REFRESH_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_COOKIE_NAME,
} from "../src/auth/token-config.js";

describe("authentication token configuration", () => {
  it("uses a 15-minute default access-token lifetime", () => {
    /**
     * I keep the default explicit in the test suite because changing the
     * access-token lifetime changes the authentication security policy.
     *
     * Deployments may override this value through the environment, but the
     * application default remains 15 minutes when no override is configured.
     */
    expect(DEFAULT_ACCESS_TOKEN_TTL_SECONDS).toBe(15 * 60);
  });

  it("uses a seven-day default refresh-token lifetime", () => {
    /**
     * The refresh-token default is also an explicit session-policy decision.
     * Environment configuration may override it within the supported limits.
     */
    expect(DEFAULT_REFRESH_TOKEN_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
  });

  it("defines the supported access-token lifetime range", () => {
    /**
     * I keep a bounded configuration range so an environment typo or unsafe
     * deployment value cannot silently create extremely short or excessively
     * long-lived access tokens.
     */
    expect(MIN_ACCESS_TOKEN_TTL_SECONDS).toBe(60);
    expect(MAX_ACCESS_TOKEN_TTL_SECONDS).toBe(60 * 60);
  });

  it("defines the supported refresh-token lifetime range", () => {
    /**
     * Refresh tokens intentionally have a different range because they serve
     * a longer-lived session role. The current policy permits values from
     * 1 hour through 30 days.
     */
    expect(MIN_REFRESH_TOKEN_TTL_SECONDS).toBe(60 * 60);
    expect(MAX_REFRESH_TOKEN_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  it("derives the refresh cookie lifetime from the effective token lifetime", () => {
    /**
     * Browser cookie maxAge uses milliseconds while token lifetimes use
     * seconds. I derive the cookie value from the effective refresh-token TTL
     * so an environment override cannot leave the JWT and cookie lifetimes
     * accidentally out of sync.
     */
    expect(
      getRefreshTokenCookieMaxAgeMs(DEFAULT_REFRESH_TOKEN_TTL_SECONDS),
    ).toBe(DEFAULT_REFRESH_TOKEN_TTL_SECONDS * 1000);
  });

  it("keeps a custom refresh-token lifetime synchronized with the cookie", () => {
    /**
     * Using a non-default value proves that cookie lifetime calculation is
     * dynamic rather than accidentally tied to the seven-day default.
     */
    const customRefreshTokenTtlSeconds = 86400;

    expect(
      getRefreshTokenCookieMaxAgeMs(customRefreshTokenTtlSeconds),
    ).toBe(customRefreshTokenTtlSeconds * 1000);
  });

  it("uses a dedicated refresh-token cookie name", () => {
    /**
     * Keeping the cookie name stable matters when the server later needs to
     * create, read, rotate, and clear the same authentication cookie.
     */
    expect(REFRESH_TOKEN_COOKIE_NAME).toBe("mailshrimp_refresh_token");
  });
});