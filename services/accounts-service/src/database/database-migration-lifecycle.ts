// services/accounts-service/src/database/database-migration-lifecycle.ts

import type { Pool } from "mysql2/promise";

import { runDatabaseMigrations } from "./database-migration-service.js";
import { createMySqlPool, type MySqlPoolConfig } from "./mysql-pool.js";

/**
 * Defines the infrastructure operations required by the dedicated database
 * migration lifecycle.
 *
 * I inject these operations so lifecycle behavior can be tested without
 * opening a real MySQL connection or executing real schema changes.
 */
export interface DatabaseMigrationLifecycleDependencies {
    createPool: (config: MySqlPoolConfig) => Pool;
    runMigrations: (pool: Pool) => Promise<void>;
}

/**
 * Production dependencies used by the migration command.
 *
 * Tests can provide isolated doubles while the real executable uses the same
 * pool factory and migration service as the application.
 */
const defaultDependencies: DatabaseMigrationLifecycleDependencies = {
    createPool: createMySqlPool,
    runMigrations: runDatabaseMigrations,
};

/**
 * Creates the migration pool, executes pending migrations, and always releases
 * the pool before returning.
 *
 * This lifecycle is separate from the HTTP service lifecycle. The migration
 * process owns the pool it creates and therefore also owns its cleanup.
 *
 * I use finally so the pool is closed after both successful migration
 * execution and migration failure. A failed schema change must not leave
 * database connections alive and keep the migration process running.
 */
export async function executeDatabaseMigrationLifecycle(
    config: MySqlPoolConfig,
    dependencies: DatabaseMigrationLifecycleDependencies = defaultDependencies,
): Promise<void> {
    const pool = dependencies.createPool(config);

    try {
        await dependencies.runMigrations(pool);
    } finally {
        await pool.end();
    }
}
