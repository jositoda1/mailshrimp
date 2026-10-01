// services/accounts-service/__tests__/mysql-migrations.test.ts

import { loadMySqlMigrations } from "../src/database/mysql-migrations.js";

describe("loadMySqlMigrations", () => {
    it("loads the ordered auth-session migration manifest", async () => {
        const migrations = await loadMySqlMigrations();

        expect(migrations).toHaveLength(1);

        expect(migrations[0]?.name).toBe("001-create-auth-sessions.sql");

        expect(migrations[0]?.sql).toContain("CREATE TABLE auth_sessions");
    });

    it("loads migration SQL from the versioned migration file", async () => {
        const migrations = await loadMySqlMigrations();
        const migration = migrations[0];

        expect(migration).toBeDefined();

        /**
         * These assertions protect important schema/security decisions rather
         * than every formatting detail of the SQL file.
         */
        expect(migration?.sql).toContain(
            "UNIQUE KEY uq_auth_sessions_token_id",
        );
        expect(migration?.sql).toContain(
            "KEY idx_auth_sessions_account_revoked",
        );
        expect(migration?.sql).toContain("KEY idx_auth_sessions_expires_at");
        expect(migration?.sql).toContain("ENGINE=InnoDB");
    });
});
