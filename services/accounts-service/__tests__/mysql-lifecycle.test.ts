// services/accounts-service/__tests__/mysql-lifecycle.test.ts

import { jest } from "@jest/globals";
import type { Pool } from "mysql2/promise";

import type { MySqlPoolConfig } from "../src/database/mysql-pool.js";

/**
 * Represents the production functions that this lifecycle unit coordinates.
 *
 * I mock pool creation and readiness separately so these tests can verify
 * resource ownership and cleanup without opening a real MySQL connection.
 */
type CreateMySqlPoolMock = (config: MySqlPoolConfig) => Pool;
type VerifyMySqlReadinessMock = (pool: Pool) => Promise<void>;

/**
 * The mocks must be registered before mysql-lifecycle.ts is imported because
 * that module imports these infrastructure functions at module initialization
 * time.
 */
const createMySqlPoolMock = jest.fn<CreateMySqlPoolMock>();
const verifyMySqlReadinessMock = jest.fn<VerifyMySqlReadinessMock>();

jest.unstable_mockModule("../src/database/mysql-pool.js", () => ({
    createMySqlPool: createMySqlPoolMock,
}));

jest.unstable_mockModule("../src/database/mysql-readiness.js", () => ({
    verifyMySqlReadiness: verifyMySqlReadinessMock,
}));

const { closeMySql, initializeMySql } =
    await import("../src/database/mysql-lifecycle.js");

/**
 * Creates the smallest Pool test double required by the lifecycle module.
 *
 * I keep the cast at the test-double boundary because production code receives
 * the complete mysql2 Pool contract while these tests only need pool.end().
 */
function createPoolMock(): {
    pool: Pool;
    end: jest.Mock<() => Promise<void>>;
} {
    const end = jest.fn<() => Promise<void>>();

    return {
        pool: {
            end,
        } as unknown as Pool,
        end,
    };
}

const databaseConfig: MySqlPoolConfig = {
    host: "127.0.0.1",
    port: 3306,
    database: "mailshrimp_test",
    user: "mailshrimp_test",
    password: "database-secret",
};

describe("MySQL lifecycle", () => {
    beforeEach(() => {
        createMySqlPoolMock.mockReset();
        verifyMySqlReadinessMock.mockReset();
    });

    describe("initializeMySql", () => {
        it("returns the pool after database readiness succeeds", async () => {
            const { pool, end } = createPoolMock();

            createMySqlPoolMock.mockReturnValue(pool);
            verifyMySqlReadinessMock.mockResolvedValue();

            await expect(initializeMySql(databaseConfig)).resolves.toBe(pool);

            expect(createMySqlPoolMock).toHaveBeenCalledTimes(1);
            expect(createMySqlPoolMock).toHaveBeenCalledWith(databaseConfig);

            expect(verifyMySqlReadinessMock).toHaveBeenCalledTimes(1);
            expect(verifyMySqlReadinessMock).toHaveBeenCalledWith(pool);

            /**
             * A successfully initialized pool is handed to the caller, so this
             * function must not close a resource that the running service now owns.
             */
            expect(end).not.toHaveBeenCalled();
        });

        it("closes the pool and preserves the readiness error when startup fails", async () => {
            const { pool, end } = createPoolMock();
            const readinessError = new Error("database unavailable");

            createMySqlPoolMock.mockReturnValue(pool);
            verifyMySqlReadinessMock.mockRejectedValue(readinessError);
            end.mockResolvedValue();

            /**
             * The original readiness failure must remain observable by the executable
             * startup boundary after lifecycle cleanup completes.
             */
            await expect(initializeMySql(databaseConfig)).rejects.toBe(
                readinessError,
            );

            expect(verifyMySqlReadinessMock).toHaveBeenCalledWith(pool);
            expect(end).toHaveBeenCalledTimes(1);
        });
    });

    describe("closeMySql", () => {
        it("closes the supplied pool", async () => {
            const { pool, end } = createPoolMock();

            end.mockResolvedValue();

            await expect(closeMySql(pool)).resolves.toBeUndefined();

            expect(end).toHaveBeenCalledTimes(1);
        });

        it("propagates pool shutdown errors", async () => {
            const { pool, end } = createPoolMock();
            const shutdownError = new Error("database pool close failed");

            end.mockRejectedValue(shutdownError);

            /**
             * Shutdown failures must remain visible to the executable lifecycle
             * boundary so they can be logged and reflected in process termination.
             */
            await expect(closeMySql(pool)).rejects.toBe(shutdownError);

            expect(end).toHaveBeenCalledTimes(1);
        });
    });
});
