/**
 * Default TCP port used by the accounts service.
 *
 * I keep the current production port as the default so the local application
 * and the deployed service use the same port unless a deployment environment
 * explicitly overrides it through the PORT environment variable.
 */
export const DEFAULT_PORT = 3111;

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