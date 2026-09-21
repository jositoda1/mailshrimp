/**
 * Default TCP port used by the accounts service.
 *
 * I keep the current production port as the default so the local application
 * and the deployed service use the same port unless a deployment environment
 * explicitly overrides it through the PORT environment variable.
 */
export const DEFAULT_PORT = 3111;

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