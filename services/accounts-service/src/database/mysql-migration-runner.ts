// services/accounts-service/src/database/mysql-migration-runner.ts

import type { Pool, RowDataPacket } from "mysql2/promise";

/**
 * Represents one versioned database migration known to the application.
 *
 * The migration name is persisted in schema_migrations after the SQL has
 * completed successfully. Names must therefore remain stable once a migration
 * has been applied to any shared environment.
 */
export interface MySqlMigration {
    name: string;
    sql: string;
}

/**
 * Represents the rows returned when the runner reads migration history.
 */
interface AppliedMigrationRow extends RowDataPacket {
    name: string;
}

/**
 * Creates the metadata table used to record successfully applied migrations.
 *
 * I deliberately keep migration history separate from application tables.
 * The runner needs a durable source of truth so it never relies on inspecting
 * whether an application table happens to exist.
 *
 * CREATE TABLE IF NOT EXISTS is appropriate for this bootstrap table because
 * this table is infrastructure owned by the runner itself. Application
 * migrations remain explicitly versioned and are not made silently
 * idempotent with IF NOT EXISTS.
 */
async function ensureMigrationTable(pool: Pool): Promise<void> {
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name VARCHAR(255) NOT NULL,
            applied_at DATETIME(3) NOT NULL,
            PRIMARY KEY (name)
        ) ENGINE=InnoDB
    `);
}

/**
 * Reads the migration names already recorded by this database.
 *
 * Returning a Set makes the later membership check explicit and prevents the
 * runner from executing a migration whose stable name has already been
 * recorded.
 */
async function readAppliedMigrationNames(pool: Pool): Promise<Set<string>> {
    const [rows] = await pool.query<AppliedMigrationRow[]>(
        `
            SELECT name
            FROM schema_migrations
            ORDER BY name ASC
        `,
    );

    return new Set(rows.map((row) => row.name));
}

/**
 * Validates the migration list before any application migration is executed.
 *
 * Duplicate names would make migration history ambiguous because the metadata
 * table identifies migrations by name. I reject that programming error before
 * changing application schema.
 */
function validateMigrations(migrations: readonly MySqlMigration[]): void {
    const names = new Set<string>();

    for (const migration of migrations) {
        if (migration.name.trim().length === 0) {
            throw new Error("MySQL migration names must not be empty");
        }

        if (migration.sql.trim().length === 0) {
            throw new Error(
                `MySQL migration "${migration.name}" must contain SQL`,
            );
        }

        if (names.has(migration.name)) {
            throw new Error(
                `Duplicate MySQL migration name: ${migration.name}`,
            );
        }

        names.add(migration.name);
    }
}

/**
 * Applies all pending MySQL migrations in the order supplied by the caller.
 *
 * Migration ordering is explicit rather than discovered implicitly here. The
 * caller owns the ordered migration manifest, which makes the exact schema
 * history visible in source control and straightforward to test.
 *
 * After a migration succeeds, I record its stable name and application time.
 * A recorded migration is skipped on later runs.
 *
 * MySQL DDL can cause implicit commits. I therefore do not wrap arbitrary
 * schema migrations in a transaction and claim rollback semantics that MySQL
 * cannot guarantee. Each migration should be designed so failure and recovery
 * behavior is understood before it is deployed.
 */
export async function runMySqlMigrations(
    pool: Pool,
    migrations: readonly MySqlMigration[],
): Promise<void> {
    validateMigrations(migrations);

    await ensureMigrationTable(pool);

    const appliedMigrationNames = await readAppliedMigrationNames(pool);

    for (const migration of migrations) {
        if (appliedMigrationNames.has(migration.name)) {
            continue;
        }

        /**
         * The SQL is trusted application source, not user input. Runtime values
         * must still use parameter binding inside migrations whenever values are
         * involved; migration SQL itself must never be assembled from untrusted
         * request data.
         */
        await pool.query(migration.sql);

        /**
         * Only record the migration after its SQL completes successfully. If the
         * query throws, execution stops and this INSERT is never reached.
         */
        await pool.execute(
            `
                INSERT INTO schema_migrations (
                    name,
                    applied_at
                )
                VALUES (?, ?)
            `,
            [migration.name, new Date()],
        );

        appliedMigrationNames.add(migration.name);
    }
}
