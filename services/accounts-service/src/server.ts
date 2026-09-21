import { createApp } from "./app.js";
import { getPort } from "./config/environment.js";
import { logger } from "./logging/logger.js";

/**
 * I resolve the server port before creating the HTTP listener so invalid
 * environment configuration causes the service to fail immediately during
 * startup.
 */
const port = getPort();

/**
 * I create the Express application through createApp() instead of configuring
 * Express directly in this file.
 *
 * Keeping application construction separate from server startup allows the
 * application to be tested with Supertest without opening a real TCP port.
 */
const app = createApp();

/**
 * This file is the executable entry point of the accounts service.
 *
 * Only the executable server is responsible for opening the network port.
 * The Express application itself remains independent from the HTTP listener,
 * which keeps the service easier to test and maintain.
 */
app.listen(port, () => {
  /**
   * I use the structured application logger instead of console.log so startup
   * events have the same machine-readable format and service metadata as the
   * rest of the accounts-service logs.
   *
   * The event name makes this entry easy to search when investigating service
   * restarts, deployments, or availability problems.
   */
  logger.info(
    {
      event: "service_started",
      port,
    },
    "Accounts service started.",
  );
});