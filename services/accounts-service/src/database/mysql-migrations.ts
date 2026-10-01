// services/accounts-service/src/database/mysql-migrations.ts

import { readFile } from "node:fs/promises";

import type { MySqlMigration } from "./mysql-migration-runner.js";

/**
 * Describes one migration file that belongs to the accounts-service schema.
 *
 * I keep this manifest explicit instead of discovering arbitrary files from a
 * directory at runtime. Migration ordering therefore remains visible in source
 * control and cannot accidentally change because of filesystem enumeration.
 */
interface MySqlMigrationFile {
    name: string;
    fileName: string;
}

/**
 * Ordered migration history for the accounts service.
 *
 * Once a migration has been deployed, its name and position must remain
 * stable. Schema changes should be introduced by appending a new migration
 * rather than modifying an already applied migration.
 */
const migrationFiles: readonly MySqlMigrationFile[] = [
    {
        name: "001-create-auth-sessions.sql",
        fileName: "001-create-auth-sessions.sql",
    },
];

/**
 * Loads the versioned SQL migrations shipped with the accounts service.
 *
 * The migrations directory is resolved relative to this module rather than
 * process.cwd(). This keeps migration loading independent from the directory
 * from which the Node.js process was launched.
 */
export async function loadMySqlMigrations(): Promise<
    readonly MySqlMigration[]
> {
    const migrationsDirectory = new URL("./migrations/", import.meta.url);

    return Promise.all(
        migrationFiles.map(async ({ name, fileName }) => {
            const migrationUrl = new URL(fileName, migrationsDirectory);
            const sql = await readFile(migrationUrl, "utf8");

            return {
                name,
                sql,
            };
        }),
    );
}
