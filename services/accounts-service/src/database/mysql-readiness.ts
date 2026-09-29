// services/accounts-service/src/database/mysql-readiness.ts

import type { Pool } from "mysql2/promise";

/**
 * Verifies that the accounts service can communicate with MySQL.
 *
 * I keep the readiness query in a dedicated infrastructure function instead
 * of placing SQL directly in server.ts. This keeps executable startup focused
 * on lifecycle orchestration and makes database readiness independently
 * testable without opening an HTTP listener.
 *
 * The query intentionally reads no application tables. At this stage I only
 * need to prove that the configured MySQL server accepts a connection and can
 * execute a minimal query. Schema migration/version validation remains a
 * separate responsibility that can be added when the migration runner is
 * designed.
 *
 * I let mysql2 propagate connection, authentication, timeout, and query errors
 * to the caller. Startup code can then fail before accepting HTTP traffic
 * rather than hiding a database failure and reporting a misleading healthy
 * service.
 */
export async function verifyMySqlReadiness(pool: Pool): Promise<void> {
    /**
     * SELECT 1 is deliberately static SQL with no user-controlled values.
     *
     * Application repositories continue to use parameter binding for dynamic
     * values. There are no values to bind in this connectivity probe.
     */
    await pool.query("SELECT 1");
}
