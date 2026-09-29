// services/accounts-service/src/database/mysql-lifecycle.ts

import type { Pool } from "mysql2/promise";

import type { MySqlPoolConfig } from "./mysql-pool.js";
import { createMySqlPool } from "./mysql-pool.js";
import { verifyMySqlReadiness } from "./mysql-readiness.js";

/**
 * Creates and verifies the shared MySQL pool used by the accounts service.
 *
 * I keep pool creation and initial readiness verification together because
 * they form one startup lifecycle operation: a pool is not useful to the
 * running service until MySQL has accepted a connection and executed the
 * readiness query successfully.
 *
 * The returned pool is owned by the caller. Once startup succeeds, the
 * executable server becomes responsible for closing it during graceful
 * shutdown.
 */
export async function initializeMySql(config: MySqlPoolConfig): Promise<Pool> {
    const pool = createMySqlPool(config);

    try {
        /**
         * I verify connectivity before returning the pool to the application.
         * This prevents startup from treating an unreachable database as ready.
         */
        await verifyMySqlReadiness(pool);

        return pool;
    } catch (error: unknown) {
        /**
         * Pool creation happens before the first connectivity check. If that check
         * fails, I close the pool here because ownership has not yet been handed
         * to the executable server.
         *
         * Without this cleanup, failed startup attempts could leave database
         * resources alive until the Node.js process eventually terminates.
         */
        await pool.end();

        /**
         * I preserve the original startup error instead of replacing it with a
         * generic readiness error. The executable boundary can log the real cause
         * without this infrastructure layer deciding process behavior.
         */
        throw error;
    }
}

/**
 * Closes the shared MySQL pool during service shutdown.
 *
 * I expose shutdown through this lifecycle module rather than calling
 * pool.end() throughout the application. This keeps resource ownership
 * explicit and gives the executable server one operation to invoke when it
 * later handles termination signals.
 */
export async function closeMySql(pool: Pool): Promise<void> {
    await pool.end();
}
