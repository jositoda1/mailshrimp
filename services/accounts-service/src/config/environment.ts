// services/accounts-service/src/config/environment.ts

import {
  DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
  MAX_ACCESS_TOKEN_TTL_SECONDS,
  MAX_REFRESH_TOKEN_TTL_SECONDS,
  MIN_ACCESS_TOKEN_TTL_SECONDS,
  MIN_REFRESH_TOKEN_TTL_SECONDS,
} from "../auth/token-config.js";

/**
 * Default TCP port used by the accounts service.
 *
 * I keep the current production port as the default so the local application
 * and the deployed service use the same port unless a deployment environment
 * explicitly overrides it through the PORT environment variable.
 */
export const DEFAULT_PORT = 3111;

/**
 * Default TCP port used by MySQL.
 *
 * I keep the standard MySQL port as a fallback so deployments only need to
 * override DB_PORT when their database listens on a non-standard port.
 */
export const DEFAULT_DB_PORT = 3306;

/**
 * Minimum length required for authentication signing secrets.
 *
 * I require at least 32 characters as a basic configuration safeguard.
 * Length alone does not make a secret cryptographically strong, so real
 * secrets must still be generated from a cryptographically secure random
 * source rather than chosen manually.
 */
export const MIN_AUTH_SECRET_LENGTH = 32;

/**
 * Validated MySQL configuration used by the accounts-service persistence
 * infrastructure.
 *
 * I keep database configuration independent from mysql2 so the configuration
 * layer validates deployment input without depending on a particular database
 * client implementation.
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Authentication secrets required by the accounts service.
 *
 * I keep access-token and refresh-token secrets separate because the two token
 * classes have different security responsibilities and lifetimes. Reusing one
 * signing secret would unnecessarily couple their security boundaries.
 */
export interface AuthenticationSecrets {
  accessTokenSecret: string;
  refreshTokenSecret: string;
}

/**
 * Validated token lifetimes used by the authentication layer.
 *
 * I expose seconds explicitly in the property names so callers cannot confuse
 * JWT lifetime values with millisecond-based values such as cookie maxAge.
 */
export interface AuthenticationTokenLifetimes {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
}

/**
 * Resolves the TCP port used by the HTTP server.
 *
 * I keep environment configuration separate from server startup so this
 * behavior can be tested independently without opening a real network port.
 *
 * In production, calling getPort() without an argument reads process.env.PORT.
 * In tests, I can pass a value directly and avoid modifying global process
 * state between test cases.
 */
export function getPort(configuredPort = process.env.PORT): number {
  /**
   * When PORT is not configured, I use the known accounts-service default.
   */
  if (configuredPort === undefined) {
    return DEFAULT_PORT;
  }

  const port = Number(configuredPort);

  /**
   * TCP ports must be integers between 1 and 65535.
   *
   * I deliberately fail during application startup when PORT is invalid.
   * Silently accepting an invalid configuration could make a deployment
   * appear successful while leaving the service unreachable.
   */
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid PORT environment variable: "${configuredPort}". Expected an integer between 1 and 65535.`,
    );
  }

  return port;
}

/**
 * Validates a required database text configuration value.
 *
 * I reject missing and whitespace-only values so the service cannot start with
 * an incomplete database configuration. I return the original value rather
 * than the trimmed version because database passwords and other credentials
 * may legitimately contain leading or trailing whitespace.
 *
 * The configured value is deliberately omitted from the error message. This
 * is especially important for DB_PASSWORD because startup errors may be
 * captured by deployment or application logs.
 */
function validateRequiredDatabaseValue(
  variableName: string,
  configuredValue: string | undefined,
): string {
  if (configuredValue === undefined || configuredValue.trim().length === 0) {
    throw new Error(
      `Invalid ${variableName} environment variable. Expected a non-empty value.`,
    );
  }

  return configuredValue;
}

/**
 * Validates the MySQL TCP port.
 *
 * I accept only decimal digits so values such as scientific notation,
 * fractional numbers, signs, or surrounding whitespace are rejected instead
 * of being interpreted implicitly by JavaScript.
 */
function validateDatabasePort(configuredPort: string): number {
  if (!/^\d+$/.test(configuredPort)) {
    throw new Error(
      "Invalid DB_PORT environment variable. Expected an integer between 1 and 65535.",
    );
  }

  const port = Number(configuredPort);

  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      "Invalid DB_PORT environment variable. Expected an integer between 1 and 65535.",
    );
  }

  return port;
}

/**
 * Resolves and validates the MySQL configuration used by accounts-service.
 *
 * The database host, database name, user, and password are required because I
 * do not want a deployment to silently connect with guessed credentials or to
 * an unintended database. DB_PORT is the only database value with a default,
 * using the standard MySQL port when it is omitted.
 *
 * Parameters default to process.env during normal application execution while
 * remaining injectable for tests. This keeps configuration tests deterministic
 * and avoids modifying global process state between test cases.
 */
export function getDatabaseConfig(
  host = process.env.DB_HOST,
  configuredPort = process.env.DB_PORT,
  database = process.env.DB_NAME,
  user = process.env.DB_USER,
  password = process.env.DB_PASSWORD,
): DatabaseConfig {
  const validatedHost = validateRequiredDatabaseValue("DB_HOST", host);
  const validatedDatabase = validateRequiredDatabaseValue("DB_NAME", database);
  const validatedUser = validateRequiredDatabaseValue("DB_USER", user);
  const validatedPassword = validateRequiredDatabaseValue(
    "DB_PASSWORD",
    password,
  );

  const port =
    configuredPort === undefined
      ? DEFAULT_DB_PORT
      : validateDatabasePort(configuredPort);

  return {
    host: validatedHost,
    port,
    database: validatedDatabase,
    user: validatedUser,
    password: validatedPassword,
  };
}

/**
 * Validates one authentication signing secret.
 *
 * I deliberately avoid including the configured value in error messages.
 * Configuration errors are commonly written to application or deployment
 * logs, so echoing a secret here could turn a harmless startup failure into
 * credential disclosure.
 */
function validateAuthenticationSecret(
  variableName: string,
  configuredSecret: string | undefined,
): string {
  if (
    configuredSecret === undefined ||
    configuredSecret.trim().length < MIN_AUTH_SECRET_LENGTH
  ) {
    throw new Error(
      `Invalid ${variableName} environment variable. Expected a secret containing at least ${MIN_AUTH_SECRET_LENGTH} characters.`,
    );
  }

  return configuredSecret;
}

/**
 * Resolves and validates the authentication signing secrets.
 *
 * Parameters default to process.env for normal application execution while
 * remaining injectable in tests. This keeps tests deterministic and avoids
 * mutating process-wide environment state.
 */
export function getAuthenticationSecrets(
  accessTokenSecret = process.env.ACCESS_TOKEN_SECRET,
  refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET,
): AuthenticationSecrets {
  const validatedAccessTokenSecret = validateAuthenticationSecret(
    "ACCESS_TOKEN_SECRET",
    accessTokenSecret,
  );

  const validatedRefreshTokenSecret = validateAuthenticationSecret(
    "REFRESH_TOKEN_SECRET",
    refreshTokenSecret,
  );

  /**
   * Access and refresh tokens must not share a signing secret.
   *
   * Keeping them different reduces unnecessary coupling between token classes
   * and also allows either signing credential to be rotated independently.
   */
  if (validatedAccessTokenSecret === validatedRefreshTokenSecret) {
    throw new Error(
      "ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must use different values.",
    );
  }

  return {
    accessTokenSecret: validatedAccessTokenSecret,
    refreshTokenSecret: validatedRefreshTokenSecret,
  };
}

/**
 * Validates one configurable authentication-token lifetime.
 *
 * I accept only a base-10 integer written entirely as decimal digits. Using
 * Number() alone would also accept formats such as scientific notation or
 * whitespace-only variations, which makes deployment configuration less
 * predictable than necessary.
 *
 * The minimum and maximum are policy safeguards defined by token-config.ts.
 * Invalid configured values fail startup instead of silently falling back to a
 * default, because silently ignoring a typo could create an authentication
 * policy different from the one the operator intended.
 */
function validateTokenLifetime(
  variableName: string,
  configuredValue: string,
  minimumSeconds: number,
  maximumSeconds: number,
): number {
  if (!/^\d+$/.test(configuredValue)) {
    throw new Error(
      `Invalid ${variableName} environment variable. Expected an integer between ${minimumSeconds} and ${maximumSeconds} seconds.`,
    );
  }

  const lifetimeSeconds = Number(configuredValue);

  if (
    !Number.isSafeInteger(lifetimeSeconds) ||
    lifetimeSeconds < minimumSeconds ||
    lifetimeSeconds > maximumSeconds
  ) {
    throw new Error(
      `Invalid ${variableName} environment variable. Expected an integer between ${minimumSeconds} and ${maximumSeconds} seconds.`,
    );
  }

  return lifetimeSeconds;
}

/**
 * Resolves and validates authentication-token lifetimes.
 *
 * I keep the defaults in token-config.ts so the authentication policy has one
 * source of truth. Environment variables can override those defaults without
 * requiring the application to be rebuilt.
 *
 * Parameters remain injectable so tests can validate configuration behavior
 * without changing process.env and leaking state between test cases.
 */
export function getAuthenticationTokenLifetimes(
  accessTokenTtl = process.env.ACCESS_TOKEN_TTL_SECONDS,
  refreshTokenTtl = process.env.REFRESH_TOKEN_TTL_SECONDS,
): AuthenticationTokenLifetimes {
  const accessTokenTtlSeconds =
    accessTokenTtl === undefined
      ? DEFAULT_ACCESS_TOKEN_TTL_SECONDS
      : validateTokenLifetime(
          "ACCESS_TOKEN_TTL_SECONDS",
          accessTokenTtl,
          MIN_ACCESS_TOKEN_TTL_SECONDS,
          MAX_ACCESS_TOKEN_TTL_SECONDS,
        );

  const refreshTokenTtlSeconds =
    refreshTokenTtl === undefined
      ? DEFAULT_REFRESH_TOKEN_TTL_SECONDS
      : validateTokenLifetime(
          "REFRESH_TOKEN_TTL_SECONDS",
          refreshTokenTtl,
          MIN_REFRESH_TOKEN_TTL_SECONDS,
          MAX_REFRESH_TOKEN_TTL_SECONDS,
        );

  return {
    accessTokenTtlSeconds,
    refreshTokenTtlSeconds,
  };
}
