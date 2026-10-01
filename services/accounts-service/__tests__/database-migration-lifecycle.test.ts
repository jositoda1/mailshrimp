// services/accounts-service/__tests__/database-migration-lifecycle.test.ts

import { jest } from "@jest/globals";
import type { Pool } from "mysql2/promise";

import {
    executeDatabaseMigrationLifecycle,
    type DatabaseMigrationLifecycleDependencies,
} from "../src/database/database-migration-lifecycle.js";
import type { MySqlPoolConfig } from "../src/database/mysql-pool.js";

/**
 * Explicit mock signatures keep the Jest 30 mock types aligned with the
 * production dependency contract.
 *
 * I avoid using plain jest.Mock here because that defaults to UnknownFunction,
 * which is not assignable to mocks whose parameters have specific types.
 */
type CreatePoolMock = (config: MySqlPoolConfig) => Pool;
type RunMigrationsMock = (pool: Pool) => Promise<void>;
type EndPoolMock = () => Promise<void>;

describe("executeDatabaseMigrationLifecycle", () => {
    const config: MySqlPoolConfig = {
        host: "127.0.0.1",
        port: 3306,
        database: "mailshrimp_test",
        user: "mailshrimp_test",
        password: "test-password",
    };

    function createDependencies(): {
        dependencies: DatabaseMigrationLifecycleDependencies;
        pool: Pool;
        createPool: jest.Mock<CreatePoolMock>;
        runMigrations: jest.Mock<RunMigrationsMock>;
        end: jest.Mock<EndPoolMock>;
    } {
        const end = jest.fn<EndPoolMock>();
        const createPool = jest.fn<CreatePoolMock>();
        const runMigrations = jest.fn<RunMigrationsMock>();

        end.mockResolvedValue(undefined);
        runMigrations.mockResolvedValue(undefined);

        /**
         * This focused lifecycle test only needs pool.end().
         *
         * I cast through unknown because the real mysql2 Pool interface
         * contains many methods that are irrelevant to this ownership and
         * cleanup behavior.
         */
        const pool = {
            end,
        } as unknown as Pool;

        createPool.mockReturnValue(pool);

        return {
            dependencies: {
                createPool,
                runMigrations,
            },
            pool,
            createPool,
            runMigrations,
            end,
        };
    }

    it("creates the pool, runs migrations, and closes the pool", async () => {
        const { dependencies, pool, createPool, runMigrations, end } =
            createDependencies();

        await executeDatabaseMigrationLifecycle(config, dependencies);

        expect(createPool).toHaveBeenCalledTimes(1);
        expect(createPool).toHaveBeenCalledWith(config);

        expect(runMigrations).toHaveBeenCalledTimes(1);
        expect(runMigrations).toHaveBeenCalledWith(pool);

        expect(end).toHaveBeenCalledTimes(1);

        /**
         * Cleanup must happen only after the migration operation has finished.
         */
        expect(runMigrations.mock.invocationCallOrder[0]).toBeLessThan(
            end.mock.invocationCallOrder[0]!,
        );
    });

    it("closes the pool when migration execution fails", async () => {
        const { dependencies, runMigrations, end } = createDependencies();

        const migrationError = new Error("migration failed");

        runMigrations.mockImplementation(() => Promise.reject(migrationError));

        await expect(
            executeDatabaseMigrationLifecycle(config, dependencies),
        ).rejects.toBe(migrationError);

        /**
         * The pool is still released through finally even though migration
         * execution failed.
         */
        expect(end).toHaveBeenCalledTimes(1);
    });

    it("propagates a pool shutdown failure after successful migrations", async () => {
        const { dependencies, end } = createDependencies();

        const shutdownError = new Error("pool shutdown failed");

        end.mockImplementation(() => Promise.reject(shutdownError));

        await expect(
            executeDatabaseMigrationLifecycle(config, dependencies),
        ).rejects.toBe(shutdownError);
    });
});
