// services/accounts-service/src/middleware/http-logger.ts

import {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { type Logger } from "pino";

import { type RequestWithId } from "./request-context.js";

/**
 * Creates the HTTP logging middleware used by the accounts service.
 *
 * I inject the logger instead of importing the global logger directly. This
 * keeps the middleware easy to test and makes the logging dependency explicit.
 */
export function createHttpLogger(logger: Logger) {
  return (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    const requestWithId = request as RequestWithId;

    /**
     * I use a monotonic high-resolution clock for elapsed time measurements.
     * Unlike the wall clock, this clock is appropriate for durations because
     * system-time adjustments cannot make a request appear to have a negative
     * or otherwise incorrect duration.
     */
    const startedAt = process.hrtime.bigint();

    /**
     * The "finish" event runs after Express has completed the HTTP response.
     * At this point the final status code is available and the request duration
     * can be measured accurately.
     */
    response.once("finish", () => {
      const finishedAt = process.hrtime.bigint();
      const durationMilliseconds =
        Number(finishedAt - startedAt) / 1_000_000;

      const logContext = {
        event: "http_request_completed",
        requestId: requestWithId.requestId,
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Number(durationMilliseconds.toFixed(3)),
      };

      /**
       * Successful and expected client responses are informational. Server-side
       * failures are logged at error level so they can later be searched,
       * monitored, and connected to alerts.
       *
       * I do not automatically log request bodies, cookies, Authorization
       * headers, query values, or response bodies because they can contain
       * credentials, tokens, personal information, or other sensitive data.
       */
      if (response.statusCode >= 500) {
        logger.error(logContext, "HTTP request completed with server error.");
        return;
      }

      if (response.statusCode >= 400) {
        logger.warn(logContext, "HTTP request completed with client error.");
        return;
      }

      logger.info(logContext, "HTTP request completed.");
    });

    next();
  };
}