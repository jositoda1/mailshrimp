import express, {
  type Express,
  type Request,
  type Response,
} from "express";
import { HttpStatus } from "@mailshrimp/http";
import { type Logger } from "pino";

import { logger as defaultLogger } from "./logging/logger.js";
import { createHttpLogger } from "./middleware/http-logger.js";
import { requestContext } from "./middleware/request-context.js";

/**
 * Creates and configures the accounts-service Express application.
 *
 * I create the Express application separately from the HTTP server so the
 * application can be tested with Supertest without opening a real network
 * port.
 *
 * A logger can be injected for automated tests. Normal application startup
 * uses the shared accounts-service logger.
 */
export function createApp(logger: Logger = defaultLogger): Express {
  const app = express();
/**
   * I disable the Express technology disclosure header because clients do not
   * need to know which server framework implements this API. This reduces
   * unnecessary implementation information exposed in HTTP responses.
   */
  app.disable("x-powered-by");

  /**
   * I create the request context before HTTP logging so the logger can include
   * the internally generated request ID in every completed-request event.
   */
  app.use(requestContext);

  /**
   * HTTP logging is registered before application routes so every request that
   * reaches the Express application can produce an operational log entry.
   */
  app.use(createHttpLogger(logger));

  /**
   * JSON parsing is configured centrally so API routes can consistently
   * consume JSON request bodies.
   *
   * Request bodies are not automatically logged because they may contain
   * credentials, personal information, or other sensitive data.
   */
  app.use(express.json());

  /**
   * The health endpoint remains intentionally small and dependency-free so it
   * can verify that the accounts service is running and accepting requests.
   */
  app.get("/health", (_request: Request, response: Response) => {
    /**
     * I use the shared HttpStatus enum so the response meaning and numeric HTTP
     * code are visible together without repeating unexplained numeric literals
     * across independently deployable APIs.
     */
    response.status(HttpStatus.OK_200).json({
      status: "ok",
      service: "accounts-service",
    });
  });


  return app;
}