// services/accounts-service/src/logging/logger.ts

import pino, {type DestinationStream, type Logger, type LoggerOptions,} from "pino";

/**
 * I keep the sensitive-field redaction policy close to the logger
 * configuration so every logger created through this module applies the same
 * baseline protection.
 *
 * The paths cover common locations where authentication credentials and other
 * secrets may appear. The wildcard paths also protect nested request headers
 * and common application objects.
 *
 * Redaction is a safety layer rather than permission to log arbitrary request
 * bodies. I still avoid logging passwords, tokens, cookies, authorization
 * headers, secrets, or complete request bodies unless there is a justified and
 * reviewed reason to do so.
 */
const REDACTED_PATHS = [
  "password",
  "*.password",
  "passwordConfirmation",
  "*.passwordConfirmation",

  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
  "refreshToken",
  "*.refreshToken",

  "secret",
  "*.secret",
  "clientSecret",
  "*.clientSecret",

  "authorization",
  "*.authorization",
  "headers.authorization",
  "*.headers.authorization",

  "cookie",
  "*.cookie",
  "headers.cookie",
  "*.headers.cookie",

  "set-cookie",
  "*.set-cookie",
  "headers.set-cookie",
  "*.headers.set-cookie",
];

/**
 * I centralize logger options so production code and automated tests exercise
 * the same security configuration.
 */
const LOGGER_OPTIONS: LoggerOptions = {
  /**
   * JSON is Pino's native output format. Structured logs are easier to search,
   * filter, aggregate, and process than free-form console messages.
   */
  level: process.env.LOG_LEVEL ?? "info",

  /**
   * I replace sensitive values instead of removing their keys completely.
   * This preserves useful diagnostic context showing that a field existed
   * without exposing its actual value.
   */
  redact: {
    paths: REDACTED_PATHS,
    censor: "[REDACTED]",
  },

  /**
   * I identify the service in every log entry. This becomes especially useful
   * when logs from multiple MailShrimp microservices are centralized later.
   */
  base: {
    service: "accounts-service",
  },
};

/**
 * Creates an accounts-service logger.
 *
 * I allow a destination stream to be supplied primarily so tests can capture
 * logger output in memory and verify security behavior without writing test
 * logs to the terminal.
 */
export function createLogger(destination?: DestinationStream): Logger {
  if (destination !== undefined) {
    return pino(LOGGER_OPTIONS, destination);
  }

  return pino(LOGGER_OPTIONS);
}

/**
 * The application uses one shared logger instance by default. This keeps the
 * logging configuration consistent and avoids creating independent loggers
 * unnecessarily throughout the service.
 */
export const logger = createLogger();