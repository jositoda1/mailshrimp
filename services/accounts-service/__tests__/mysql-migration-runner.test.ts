// services/accounts-service/__tests__/mysql-migration-runner.test.ts

import { jest } from "@jest/globals";
import type { Pool, RowDataPacket } from "mysql2/promise";

import {
    runMySqlMigrations,
    type MySqlMigration,
} from "../src/database/mysql-migration-runner.js";

describe("runMySqlMigrations", () => {
    function createPoolMock(appliedNames: string[] = []): {
        pool: Pool;
        execute: jest.Mock;
        query: jest.Mock;
    } {
        const execute = jest.fn<(...args: unknown[]) => Promise<unknown>>();
        const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();

        execute.mockResolvedValue([{}, []]);

        query.mockImplementation((sql: unknown) => {
            if (
                typeof sql === "string" &&
                sql.includes("SELECT name") &&
                sql.includes("FROM schema_migrations")
            ) {
                const rows = appliedNames.map((name) => ({
                    name,
                })) as RowDataPacket[];

                return Promise.resolve([rows, []]);
            }

            return Promise.resolve([[], []]);
        });

        return {
            pool: {
                execute,
                query,
            } as unknown as Pool,
            execute,
            query,
        };
    }

    const firstMigration: MySqlMigration = {
        name: "001-first.sql",
        sql: "CREATE TABLE first_table (id INT NOT NULL)",
    };

    const secondMigration: MySqlMigration = {
        name: "002-second.sql",
        sql: "CREATE TABLE second_table (id INT NOT NULL)",
    };

    it("creates migration metadata before reading migration history", async () => {
        const { pool, execute, query } = createPoolMock();

        await runMySqlMigrations(pool, []);

        expect(execute).toHaveBeenCalledTimes(1);
        expect(String(execute.mock.calls[0]?.[0])).toContain(
            "CREATE TABLE IF NOT EXISTS schema_migrations",
        );

        expect(query).toHaveBeenCalledTimes(1);
        expect(String(query.mock.calls[0]?.[0])).toContain(
            "FROM schema_migrations",
        );

        expect(execute.mock.invocationCallOrder[0]).toBeLessThan(
            query.mock.invocationCallOrder[0]!,
        );
    });

    it("executes and records a pending migration", async () => {
        const { pool, execute, query } = createPoolMock();

        await runMySqlMigrations(pool, [firstMigration]);

        expect(query).toHaveBeenCalledWith(firstMigration.sql);

        expect(execute).toHaveBeenCalledTimes(2);
        expect(String(execute.mock.calls[1]?.[0])).toContain(
            "INSERT INTO schema_migrations",
        );

        expect(execute.mock.calls[1]?.[1]).toEqual([
            firstMigration.name,
            expect.any(Date),
        ]);

        expect(query.mock.invocationCallOrder[1]).toBeLessThan(
            execute.mock.invocationCallOrder[1]!,
        );
    });

    it("skips a migration that is already recorded", async () => {
        const { pool, execute, query } = createPoolMock([firstMigration.name]);

        await runMySqlMigrations(pool, [firstMigration]);

        expect(query).toHaveBeenCalledTimes(1);
        expect(query).not.toHaveBeenCalledWith(firstMigration.sql);

        // Only metadata-table bootstrap should use execute().
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it("applies pending migrations in caller-supplied order", async () => {
        const { pool, query } = createPoolMock();

        await runMySqlMigrations(pool, [firstMigration, secondMigration]);

        expect(query).toHaveBeenCalledTimes(3);
        expect(query.mock.calls[1]?.[0]).toBe(firstMigration.sql);
        expect(query.mock.calls[2]?.[0]).toBe(secondMigration.sql);
    });

    it("does not record a migration when its SQL fails", async () => {
        const { pool, execute, query } = createPoolMock();
        const migrationError = new Error("migration failed");

        let queryCallCount = 0;

        query.mockImplementation(() => {
            queryCallCount += 1;

            /**
             * The first query reads the migration history. The second query is the
             * pending migration itself, which fails.
             */
            if (queryCallCount === 1) {
                return Promise.resolve([[], []]);
            }

            return Promise.reject(migrationError);
        });

        await expect(runMySqlMigrations(pool, [firstMigration])).rejects.toBe(
            migrationError,
        );

        /**
         * Only the schema_migrations bootstrap should have executed. The failed
         * migration must never be recorded as successfully applied.
         */
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it("rejects an empty migration name before touching MySQL", async () => {
        const { pool, execute, query } = createPoolMock();

        await expect(
            runMySqlMigrations(pool, [
                {
                    name: "   ",
                    sql: firstMigration.sql,
                },
            ]),
        ).rejects.toThrow("MySQL migration names must not be empty");

        expect(execute).not.toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
    });

    it("rejects empty migration SQL before touching MySQL", async () => {
        const { pool, execute, query } = createPoolMock();

        await expect(
            runMySqlMigrations(pool, [
                {
                    name: firstMigration.name,
                    sql: "   ",
                },
            ]),
        ).rejects.toThrow(
            `MySQL migration "${firstMigration.name}" must contain SQL`,
        );

        expect(execute).not.toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
    });

    it("rejects duplicate migration names before touching MySQL", async () => {
        const { pool, execute, query } = createPoolMock();

        await expect(
            runMySqlMigrations(pool, [
                firstMigration,
                {
                    name: firstMigration.name,
                    sql: secondMigration.sql,
                },
            ]),
        ).rejects.toThrow(
            `Duplicate MySQL migration name: ${firstMigration.name}`,
        );

        expect(execute).not.toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
    });
});
