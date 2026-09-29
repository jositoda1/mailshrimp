// services/accounts-service/src/server.ts

import { MySqlAuthSessionRepository } from "./auth/session/mysql-auth-session-repository.js";
import { createApp } from "./app.js";
import {
  getAuthenticationSecrets,
  getAuthenticationTokenLifetimes,
  getDatabaseConfig,
  getPort,
} from "./config/environment.js";
import { initializeMySql } from "./database/mysql-lifecycle.js";
import { logger } from "./logging/logger.js";
import { shutdownService, type ShutdownSignal } from "./service-shutdown.js";
import { registerShutdownSignals } from "./shutdown-signals.js";

/**
 * Starts the executable accounts service.
 *
 * I keep startup orchestration in one asynchronous function because mandatory
 * infrastructure dependencies must become ready before the HTTP listener is
 * opened. This prevents the process from accepting traffic while required
 * persistence infrastructure is unavailable.
 */
async function startServer(): Promise<void> {
  /**
   * I resolve required environment configuration before creating runtime
   * resources. Invalid deployment configuration therefore fails before a
   * database pool or HTTP listener is created.
   */
  const port = getPort();

  /**
   * Database configuration is mandatory service configuration.
   *
   * I retain the validated object because it is passed explicitly into the
   * MySQL lifecycle layer. Database infrastructure does not read process.env
   * directly, which keeps configuration parsing centralized and independently
   * testable.
   *
   * I deliberately never log this object because it contains DB_PASSWORD.
   */
  const databaseConfig = getDatabaseConfig();

  /**
   * Authentication signing credentials are mandatory service configuration.
   *
   * I validate them during startup even though authentication HTTP routes are
   * not wired into the application yet. This prevents a deployment from
   * appearing healthy while carrying invalid authentication configuration.
   *
   * Authentication secrets are deliberately never logged.
   */
  getAuthenticationSecrets();

  /**
   * Token lifetimes are validated during startup for the same fail-fast
   * reason. They will be injected into the authentication layer when the HTTP
   * authentication flow is implemented.
   */
  getAuthenticationTokenLifetimes();

  /**
   * I initialize one shared MySQL pool for this service process.
   *
   * initializeMySql() creates the bounded pool and verifies live database
   * connectivity before returning it. If readiness fails, initialization
   * closes the pool before propagating the startup failure.
   *
   * A successful return transfers ownership of the pool to this executable
   * lifecycle.
   */
  const databasePool = await initializeMySql(databaseConfig);

  /**
   * I create one MySQL-backed authentication session repository from the
   * shared service pool.
   *
   * The repository receives its persistence dependency explicitly instead of
   * creating its own pool. This keeps database connection ownership
   * centralized in the executable lifecycle and prevents repository instances
   * from creating independent connection pools.
   *
   * Constructing this repository does not execute a database query.
   * Authentication use cases will call it later when login, refresh, logout,
   * and session-management behavior is connected to HTTP routes.
   */
  const authSessionRepository = new MySqlAuthSessionRepository(databasePool);

  /**
   * I create the Express application only after mandatory startup dependencies
   * have passed their validation and readiness checks.
   *
   * I inject the authentication session repository through the application
   * dependency contract instead of allowing createApp() to construct database
   * infrastructure. This keeps application composition explicit and makes it
   * possible for tests to provide controlled repository implementations.
   */
  const app = createApp(logger, {
    authSessionRepository,
  });

  /**
   * app.listen() returns the underlying Node.js HTTP server.
   *
   * I retain this reference because graceful shutdown must first stop the HTTP
   * listener and wait for it to finish closing before releasing the shared
   * MySQL pool.
   */
  const httpServer = app.listen(port, () => {
    /**
     * The startup event deliberately contains only non-sensitive operational
     * metadata. Database credentials and authentication secrets must never be
     * written to logs.
     */
    logger.info(
      {
        event: "service_started",
        port,
      },
      "Accounts service started.",
    );
  });

  /**
   * Performs one graceful shutdown sequence after a supported termination
   * signal has been received.
   *
   * Signal registration is separated from resource cleanup. This executable
   * boundary owns logging and process exit behavior, while shutdownService()
   * owns the tested HTTP-then-MySQL cleanup order.
   */
  const handleShutdown = async (signal: ShutdownSignal): Promise<void> => {
    logger.info(
      {
        event: "service_shutdown_started",
        signal,
      },
      "Accounts service shutdown started.",
    );

    try {
      /**
       * HTTP is closed before MySQL so persistence remains available while
       * already accepted HTTP work finishes.
       */
      await shutdownService(
        {
          httpServer,
          databasePool,
        },
        signal,
      );

      logger.info(
        {
          event: "service_shutdown_completed",
          signal,
        },
        "Accounts service shutdown completed.",
      );
    } catch (error: unknown) {
      /**
       * A shutdown failure must be visible to process supervision and
       * deployment tooling. I log the failure and mark process termination as
       * unsuccessful instead of silently treating incomplete cleanup as a
       * normal shutdown.
       */
      logger.error(
        {
          event: "service_shutdown_failed",
          signal,
          error,
        },
        "Accounts service shutdown failed.",
      );

      process.exitCode = 1;
    }
  };

  /**
   * I delegate signal registration and duplicate-signal protection to the
   * independently tested signal lifecycle module.
   *
   * That module ensures SIGTERM and SIGINT are supported and that only the
   * first received termination signal starts asynchronous cleanup.
   */
  registerShutdownSignals(handleShutdown);
}

/**
 * I handle startup failure at the executable boundary instead of hiding it in
 * lower-level infrastructure functions.
 *
 * initializeMySql() owns and closes its pool if database readiness fails before
 * ownership reaches this executable. Therefore a failed database startup does
 * not leave a successfully created but unowned MySQL pool behind.
 *
 * Database configuration and authentication secrets are intentionally absent
 * from this log event.
 */
startServer().catch((error: unknown) => {
  logger.error(
    {
      event: "service_start_failed",
      error,
    },
    "Accounts service failed to start.",
  );

  process.exitCode = 1;
});
