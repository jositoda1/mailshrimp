// services/accounts-service/src/app.ts

import express, { type Express, type Request, type Response } from "express";
import { HttpStatus } from "@mailshrimp/http";
import { type Logger } from "pino";

import type { AuthSessionRepository } from "./auth/session/auth-session-repository.js";
import { logger as defaultLogger } from "./logging/logger.js";
import { createHttpLogger } from "./middleware/http-logger.js";
import { requestContext } from "./middleware/request-context.js";

/**
 * Contains infrastructure dependencies required by the accounts application.
 *
 * I inject application dependencies instead of constructing database-backed
 * implementations inside createApp(). This keeps Express independent from
 * infrastructure creation and allows tests to provide controlled in-memory or
 * mocked implementations without opening real database connections.
 */
export interface AppDependencies {
  authSessionRepository?: AuthSessionRepository;
}

/**
 * Creates and configures the accounts-service Express application.
 *
 * I create the Express application separately from the HTTP server so the
 * application can be tested with Supertest without opening a real network
 * port.
 *
 * A logger can be injected for automated tests. Normal application startup
 * uses the shared accounts-service logger.
 *
 * Infrastructure dependencies are also injected explicitly. The authentication
 * session repository is optional temporarily because no authentication HTTP
 * route consumes it yet. Once the first authentication route is wired, I can
 * make this dependency mandatory without forcing unrelated health-route tests
 * to construct unused persistence infrastructure today.
 */
export function createApp(
  logger: Logger = defaultLogger,
  dependencies: AppDependencies = {},
): Express {
  const app = express();

  /**
   * I reference the injected repository even before authentication routes are
   * implemented so TypeScript and ESLint can verify the dependency contract
   * while this feature establishes application composition.
   *
   * No database operation is performed here. HTTP routes will consume the
   * repository when the authentication use cases are wired.
   */
  void dependencies.authSessionRepository;

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
