// services/accounts-service/src/database/database-migration-service.ts

import type { Pool } from "mysql2/promise";

import { runMySqlMigrations } from "./mysql-migration-runner.js";
import { loadMySqlMigrations } from "./mysql-migrations.js";

/**
 * Executes the accounts-service schema migrations through an already-owned
 * MySQL pool.
 *
 * I keep migration orchestration separate from process startup so this behavior
 * can be tested without reading environment variables, creating real database
 * connections, or terminating a Node.js process.
 *
 * Pool ownership remains with the caller. This function executes migrations
 * but does not close the pool.
 */
export async function runDatabaseMigrations(pool: Pool): Promise<void> {
    const migrations = await loadMySqlMigrations();

    await runMySqlMigrations(pool, migrations);
}
