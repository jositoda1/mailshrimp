// services/accounts-service/src/service-shutdown.ts

import type { Server } from "node:http";
import type { Pool } from "mysql2/promise";

import { closeMySql } from "./database/mysql-lifecycle.js";

/**
 * Represents the operating-system signals that trigger graceful shutdown.
 *
 * I restrict this type to the signals that the accounts service explicitly
 * registers. Keeping the accepted values narrow prevents callers from passing
 * arbitrary signal names into lifecycle code.
 */
export type ShutdownSignal = "SIGINT" | "SIGTERM";

/**
 * Describes the resources required to shut down the accounts service.
 *
 * The HTTP server and MySQL pool are explicit dependencies so shutdown logic
 * does not rely on hidden module-level mutable state.
 */
export interface ServiceShutdownResources {
    httpServer: Server;
    databasePool: Pool;
}

/**
 * Closes a Node.js HTTP server and resolves when Node reports that shutdown is
 * complete.
 *
 * Server.close() stops the listener from accepting new connections and invokes
 * its callback after the server has finished closing. I convert that callback
 * API into a Promise so the complete shutdown sequence can use async/await and
 * preserve an explicit resource-cleanup order.
 */
function closeHttpServer(httpServer: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        httpServer.close((error?: Error) => {
            if (error !== undefined) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

/**
 * Gracefully releases service resources after a termination signal.
 *
 * I close HTTP before MySQL so the process first stops accepting new work.
 * Only after the HTTP server has finished closing do I release the shared
 * database pool. Closing MySQL first could leave accepted requests trying to
 * use a persistence resource that has already been destroyed.
 *
 * I deliberately let shutdown errors propagate to the executable boundary.
 * The caller is responsible for structured logging and process exit behavior.
 */
export async function shutdownService(
    resources: ServiceShutdownResources,
    signal: ShutdownSignal,
): Promise<void> {
    /**
     * The signal is part of this function's contract even though resource
     * cleanup currently follows the same sequence for SIGINT and SIGTERM.
     *
     * Keeping it explicit makes the shutdown trigger visible at the call site
     * and leaves room for signal-specific observability without reading global
     * process state inside this module.
     */
    void signal;

    await closeHttpServer(resources.httpServer);
    await closeMySql(resources.databasePool);
}
