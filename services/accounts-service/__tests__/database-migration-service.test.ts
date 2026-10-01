// services/accounts-service/__tests__/database-migration-service.test.ts

import { jest } from "@jest/globals";
import type { Pool, RowDataPacket } from "mysql2/promise";

import { runDatabaseMigrations } from "../src/database/database-migration-service.js";

describe("runDatabaseMigrations", () => {
    /**
     * Creates the smallest pool double needed by the migration service.
     *
     * The real migration runner currently needs execute() for the migration
     * metadata table and query() both for migration-history reads and for the
     * migration SQL itself.
     *
     * I also expose end() so tests can prove that this service does not close
     * a pool whose lifecycle belongs to its caller.
     *
     * No real MySQL connection is opened by these tests.
     */
    function createPoolMock(): {
        pool: Pool;
        execute: jest.Mock;
        query: jest.Mock;
        end: jest.Mock;
    } {
        const execute = jest.fn<(...args: unknown[]) => Promise<unknown>>();
        const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
        const end = jest.fn<() => Promise<void>>();

        execute.mockResolvedValue([{}, []]);
        end.mockResolvedValue(undefined);

        query.mockImplementation((sql: unknown) => {
            /**
             * The migration runner first reads the durable migration history.
             *
             * Returning an empty list means migration 001 has not yet been
             * recorded and therefore remains pending.
             */
            if (
                typeof sql === "string" &&
                sql.includes("SELECT name") &&
                sql.includes("FROM schema_migrations")
            ) {
                const rows: RowDataPacket[] = [];

                return Promise.resolve([rows, []]);
            }

            return Promise.resolve([[], []]);
        });

        /**
         * The test double intentionally implements only the Pool operations
         * exercised by this code path.
         *
         * I cast through unknown because mysql2's Pool type contains many
         * additional methods that are irrelevant to this focused unit test.
         */
        const pool = {
            execute,
            query,
            end,
        } as unknown as Pool;

        return {
            pool,
            execute,
            query,
            end,
        };
    }

    it("loads and executes the current accounts-service migration", async () => {
        const { pool, execute, query } = createPoolMock();

        await runDatabaseMigrations(pool);

        /**
         * query() is called once for migration history and once for migration
         * 001 itself.
         */
        expect(query).toHaveBeenCalledTimes(2);

        const migrationSql = String(query.mock.calls[1]?.[0]);

        expect(migrationSql).toContain("CREATE TABLE auth_sessions");
        expect(migrationSql).toContain("UNIQUE KEY uq_auth_sessions_token_id");
        expect(migrationSql).toContain("ENGINE=InnoDB");

        /**
         * execute() first bootstraps schema_migrations and then records the
         * successfully completed migration.
         */
        expect(execute).toHaveBeenCalledTimes(2);

        expect(String(execute.mock.calls[0]?.[0])).toContain(
            "CREATE TABLE IF NOT EXISTS schema_migrations",
        );

        expect(String(execute.mock.calls[1]?.[0])).toContain(
            "INSERT INTO schema_migrations",
        );

        expect(execute.mock.calls[1]?.[1]).toEqual([
            "001-create-auth-sessions.sql",
            expect.any(Date),
        ]);
    });

    it("does not close a pool owned by the caller", async () => {
        const { pool, end } = createPoolMock();

        await runDatabaseMigrations(pool);

        /**
         * Pool lifecycle ownership belongs to the executable migration command.
         *
         * runDatabaseMigrations() receives an already-created pool, so closing
         * that resource here would violate the ownership boundary and could
         * surprise other callers.
         */
        expect(end).not.toHaveBeenCalled();
    });
});
