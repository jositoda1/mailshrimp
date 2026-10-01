// services/accounts-service/src/database/migrate.ts

import { getDatabaseConfig } from "../config/environment.js";
import { logger } from "../logging/logger.js";
import { executeDatabaseMigrationLifecycle } from "./database-migration-lifecycle.js";

/**
 * Runs the dedicated accounts-service database migration command.
 *
 * I keep this executable boundary small. It owns environment configuration,
 * process-level logging, and exit-code behavior, while the migration lifecycle
 * owns MySQL pool creation, migration execution, and pool cleanup.
 */
async function migrate(): Promise<void> {
    /**
     * I reuse the same validated database configuration contract as the HTTP
     * service. The migration executable does not parse DB_* variables itself.
     */
    const databaseConfig = getDatabaseConfig();

    await executeDatabaseMigrationLifecycle(databaseConfig);

    logger.info(
        {
            event: "database_migrations_completed",
        },
        "Accounts service database migrations completed.",
    );
}

/**
 * Migration failures are handled at the executable/process boundary.
 *
 * I do not log database credentials, SQL contents, or environment objects.
 * Setting process.exitCode allows the current event loop and logger to finish
 * naturally while still reporting command failure to shell, CI, or deployment
 * tooling.
 */
migrate().catch((error: unknown) => {
    logger.error(
        {
            event: "database_migrations_failed",
            error,
        },
        "Accounts service database migrations failed.",
    );

    process.exitCode = 1;
});
