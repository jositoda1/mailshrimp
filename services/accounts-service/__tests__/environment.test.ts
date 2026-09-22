// services/accounts-service/__tests__/environment.test.ts

import {
  DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
  MAX_ACCESS_TOKEN_TTL_SECONDS,
  MAX_REFRESH_TOKEN_TTL_SECONDS,
  MIN_ACCESS_TOKEN_TTL_SECONDS,
  MIN_REFRESH_TOKEN_TTL_SECONDS,
} from "../src/auth/token-config.js";
import {
  DEFAULT_DB_PORT,
  DEFAULT_PORT,
  getAuthenticationSecrets,
  getAuthenticationTokenLifetimes,
  getDatabaseConfig,
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
  it.each(["", "abc", "0", "-1", "65536", "3111.5"])(
    "rejects invalid PORT value %j",
    (configuredPort) => {
      expect(() => getPort(configuredPort)).toThrow(
        `Invalid PORT environment variable: "${configuredPort}". Expected an integer between 1 and 65535.`,
      );
    },
  );

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

describe("database configuration", () => {
  const host = "127.0.0.1";
  const database = "mailshrimp";
  const user = "mailshrimp";
  const password = "local-database-password";

  /**
   * A complete database configuration should be returned in the shape expected
   * by the persistence infrastructure without requiring mysql2 to read the
   * process environment directly.
   */
  it("returns valid database configuration", () => {
    expect(getDatabaseConfig(host, "3307", database, user, password)).toEqual({
      host,
      port: 3307,
      database,
      user,
      password,
    });
  });

  /**
   * MySQL normally listens on port 3306. I keep that as the only database
   * configuration default so deployments using the standard port do not need
   * to repeat it unnecessarily.
   */
  it("uses the standard MySQL port when DB_PORT is not configured", () => {
    expect(
      getDatabaseConfig(host, undefined, database, user, password),
    ).toEqual({
      host,
      port: DEFAULT_DB_PORT,
      database,
      user,
      password,
    });

    expect(DEFAULT_DB_PORT).toBe(3306);
  });

  /**
   * Database host, database name, database user, and password are required.
   *
   * I deliberately avoid fallback values such as root, an empty password, or
   * an implicit database name because those defaults could make a deployment
   * connect to an unintended database or use an unnecessarily privileged
   * account.
   */
  it.each([
    {
      variableName: "DB_HOST",
      values: [undefined, ""] as const,
      createConfig: (value: string | undefined) =>
        getDatabaseConfig(value, "3306", database, user, password),
    },
    {
      variableName: "DB_NAME",
      values: [undefined, ""] as const,
      createConfig: (value: string | undefined) =>
        getDatabaseConfig(host, "3306", value, user, password),
    },
    {
      variableName: "DB_USER",
      values: [undefined, ""] as const,
      createConfig: (value: string | undefined) =>
        getDatabaseConfig(host, "3306", database, value, password),
    },
    {
      variableName: "DB_PASSWORD",
      values: [undefined, ""] as const,
      createConfig: (value: string | undefined) =>
        getDatabaseConfig(host, "3306", database, user, value),
    },
  ])(
    "rejects a missing or empty $variableName value",
    ({ variableName, values, createConfig }) => {
      for (const value of values) {
        expect(() => createConfig(value)).toThrow(
          `Invalid ${variableName} environment variable. Expected a non-empty value.`,
        );
      }
    },
  );

  /**
   * Whitespace-only database values are equivalent to missing configuration
   * and must not allow the service to start.
   */
  it.each([
    {
      variableName: "DB_HOST",
      createConfig: () =>
        getDatabaseConfig("   ", "3306", database, user, password),
    },
    {
      variableName: "DB_NAME",
      createConfig: () =>
        getDatabaseConfig(host, "3306", "   ", user, password),
    },
    {
      variableName: "DB_USER",
      createConfig: () =>
        getDatabaseConfig(host, "3306", database, "   ", password),
    },
    {
      variableName: "DB_PASSWORD",
      createConfig: () =>
        getDatabaseConfig(host, "3306", database, user, "   "),
    },
  ])(
    "rejects a whitespace-only $variableName value",
    ({ variableName, createConfig }) => {
      expect(createConfig).toThrow(
        `Invalid ${variableName} environment variable. Expected a non-empty value.`,
      );
    },
  );

  /**
   * DB_PORT uses the same valid TCP range as the HTTP server, but I require a
   * strict decimal representation rather than relying on JavaScript coercion.
   */
  it.each([
    "",
    "abc",
    "0",
    "-1",
    "+3306",
    "3306.5",
    "1e3",
    " 3306",
    "3306 ",
    "65536",
  ])("rejects invalid DB_PORT value %j", (configuredPort) => {
    expect(() =>
      getDatabaseConfig(host, configuredPort, database, user, password),
    ).toThrow(
      "Invalid DB_PORT environment variable. Expected an integer between 1 and 65535.",
    );
  });

  /**
   * I explicitly protect both valid TCP boundaries so later changes to port
   * validation cannot accidentally reject legitimate values.
   */
  it("accepts the lowest valid database TCP port", () => {
    expect(getDatabaseConfig(host, "1", database, user, password).port).toBe(1);
  });

  it("accepts the highest valid database TCP port", () => {
    expect(
      getDatabaseConfig(host, "65535", database, user, password).port,
    ).toBe(65535);
  });

  /**
   * Validation uses trim only to decide whether a required value is empty.
   *
   * The original configured value must be preserved because passwords and
   * other credentials may legitimately contain leading or trailing whitespace.
   */
  it("preserves the exact database password value", () => {
    const passwordWithWhitespace = " database-password ";

    expect(
      getDatabaseConfig(host, "3306", database, user, passwordWithWhitespace)
        .password,
    ).toBe(passwordWithWhitespace);
  });

  /**
   * Database credentials must never be echoed by configuration failures
   * because startup errors may be captured by application, CI, deployment, or
   * process-manager logs.
   */
  it("does not expose the database password in an error message", () => {
    const sensitivePassword = "do-not-log-this-database-password";

    try {
      getDatabaseConfig("", "3306", database, user, sensitivePassword);

      throw new Error("Expected database configuration validation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(sensitivePassword);
    }
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

    expect(() => getAuthenticationSecrets(accessTokenSecret, tooShort)).toThrow(
      "Invalid REFRESH_TOKEN_SECRET environment variable.",
    );
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

describe("authentication token lifetime configuration", () => {
  /**
   * I keep safe application defaults so a deployment does not need to provide
   * lifetime variables unless it intentionally wants a different policy.
   *
   * Access tokens default to 15 minutes and refresh tokens default to 7 days.
   */
  it("uses the default token lifetimes when environment values are absent", () => {
    expect(getAuthenticationTokenLifetimes(undefined, undefined)).toEqual({
      accessTokenTtlSeconds: DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlSeconds: DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
    });

    expect(DEFAULT_ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(DEFAULT_REFRESH_TOKEN_TTL_SECONDS).toBe(604800);
  });

  /**
   * Deployment-specific authentication policy can override both defaults
   * without requiring a source-code change or application rebuild.
   */
  it("uses valid token lifetimes provided by the environment", () => {
    expect(getAuthenticationTokenLifetimes("300", "86400")).toEqual({
      accessTokenTtlSeconds: 300,
      refreshTokenTtlSeconds: 86400,
    });
  });

  /**
   * Each variable falls back independently. This matters during staged
   * configuration changes where a deployment may override only one lifetime.
   */
  it("uses the access-token default when only the refresh lifetime is configured", () => {
    expect(getAuthenticationTokenLifetimes(undefined, "86400")).toEqual({
      accessTokenTtlSeconds: DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlSeconds: 86400,
    });
  });

  it("uses the refresh-token default when only the access lifetime is configured", () => {
    expect(getAuthenticationTokenLifetimes("300", undefined)).toEqual({
      accessTokenTtlSeconds: 300,
      refreshTokenTtlSeconds: DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
    });
  });

  /**
   * I explicitly protect both ends of the supported access-token range.
   * The current policy allows access tokens from 1 minute through 1 hour.
   */
  it("accepts access-token lifetime boundary values", () => {
    expect(
      getAuthenticationTokenLifetimes(
        String(MIN_ACCESS_TOKEN_TTL_SECONDS),
        undefined,
      ).accessTokenTtlSeconds,
    ).toBe(MIN_ACCESS_TOKEN_TTL_SECONDS);

    expect(
      getAuthenticationTokenLifetimes(
        String(MAX_ACCESS_TOKEN_TTL_SECONDS),
        undefined,
      ).accessTokenTtlSeconds,
    ).toBe(MAX_ACCESS_TOKEN_TTL_SECONDS);
  });

  /**
   * Refresh tokens have a separate range because their security role differs
   * from short-lived access tokens. The current policy allows 1 hour through
   * 30 days.
   */
  it("accepts refresh-token lifetime boundary values", () => {
    expect(
      getAuthenticationTokenLifetimes(
        undefined,
        String(MIN_REFRESH_TOKEN_TTL_SECONDS),
      ).refreshTokenTtlSeconds,
    ).toBe(MIN_REFRESH_TOKEN_TTL_SECONDS);

    expect(
      getAuthenticationTokenLifetimes(
        undefined,
        String(MAX_REFRESH_TOKEN_TTL_SECONDS),
      ).refreshTokenTtlSeconds,
    ).toBe(MAX_REFRESH_TOKEN_TTL_SECONDS);
  });

  /**
   * Configured lifetimes must use an unambiguous base-10 integer format.
   *
   * I reject empty strings, signs, decimal values, scientific notation,
   * whitespace, and arbitrary text instead of relying on Number() coercion.
   */
  it.each(["", "abc", "-1", "+300", "300.5", "1e3", " 300", "300 "])(
    "rejects malformed access-token lifetime %j",
    (configuredLifetime) => {
      expect(() =>
        getAuthenticationTokenLifetimes(configuredLifetime, undefined),
      ).toThrow(
        `Invalid ACCESS_TOKEN_TTL_SECONDS environment variable. Expected an integer between ${MIN_ACCESS_TOKEN_TTL_SECONDS} and ${MAX_ACCESS_TOKEN_TTL_SECONDS} seconds.`,
      );
    },
  );

  it.each(["", "abc", "-1", "+3600", "3600.5", "1e4", " 3600", "3600 "])(
    "rejects malformed refresh-token lifetime %j",
    (configuredLifetime) => {
      expect(() =>
        getAuthenticationTokenLifetimes(undefined, configuredLifetime),
      ).toThrow(
        `Invalid REFRESH_TOKEN_TTL_SECONDS environment variable. Expected an integer between ${MIN_REFRESH_TOKEN_TTL_SECONDS} and ${MAX_REFRESH_TOKEN_TTL_SECONDS} seconds.`,
      );
    },
  );

  /**
   * Numeric values outside the supported security policy must fail
   * configuration instead of being silently clamped or replaced by defaults.
   */
  it("rejects access-token lifetimes outside the supported range", () => {
    expect(() =>
      getAuthenticationTokenLifetimes(
        String(MIN_ACCESS_TOKEN_TTL_SECONDS - 1),
        undefined,
      ),
    ).toThrow("Invalid ACCESS_TOKEN_TTL_SECONDS environment variable.");

    expect(() =>
      getAuthenticationTokenLifetimes(
        String(MAX_ACCESS_TOKEN_TTL_SECONDS + 1),
        undefined,
      ),
    ).toThrow("Invalid ACCESS_TOKEN_TTL_SECONDS environment variable.");
  });

  it("rejects refresh-token lifetimes outside the supported range", () => {
    expect(() =>
      getAuthenticationTokenLifetimes(
        undefined,
        String(MIN_REFRESH_TOKEN_TTL_SECONDS - 1),
      ),
    ).toThrow("Invalid REFRESH_TOKEN_TTL_SECONDS environment variable.");

    expect(() =>
      getAuthenticationTokenLifetimes(
        undefined,
        String(MAX_REFRESH_TOKEN_TTL_SECONDS + 1),
      ),
    ).toThrow("Invalid REFRESH_TOKEN_TTL_SECONDS environment variable.");
  });

  /**
   * A valid value for one token class must never hide an invalid value for the
   * other. Any invalid configured authentication policy must fail as a whole.
   */
  it("rejects an invalid refresh lifetime when the access lifetime is valid", () => {
    expect(() => getAuthenticationTokenLifetimes("300", "invalid")).toThrow(
      "Invalid REFRESH_TOKEN_TTL_SECONDS environment variable.",
    );
  });
});
