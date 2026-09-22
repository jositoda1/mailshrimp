// services/accounts-service/__tests__/mysql-pool.test.ts

import { jest } from "@jest/globals";
import type { Pool, PoolOptions } from "mysql2/promise";

/**
 * Represents the mysql2 createPool signature used by this test.
 *
 * I type the Jest mock explicitly instead of relying on jest.fn() inference.
 * This prevents the mock arguments and return value from degrading into
 * unresolved or unsafe types during ESLint analysis.
 */
type CreatePoolFunction = (config: PoolOptions) => Pool;

/*
 * I mock mysql2 itself because these tests verify pool configuration only.
 *
 * They intentionally do not open a real database connection. Real MySQL
 * behavior such as transactions, row locking, and concurrent refresh-token
 * rotation requires separate integration tests against an actual MySQL
 * instance.
 */
const createPoolMock = jest.fn<CreatePoolFunction>();

jest.unstable_mockModule("mysql2/promise", () => ({
    createPool: createPoolMock,
}));

const { createMySqlPool } = await import("../src/database/mysql-pool.js");

describe("createMySqlPool", () => {
    beforeEach(() => {
        createPoolMock.mockReset();
    });

    it("creates a MySQL pool with the supplied database configuration", () => {
        const expectedPool = {} as Pool;

        createPoolMock.mockReturnValue(expectedPool);

        const pool = createMySqlPool({
            host: "127.0.0.1",
            port: 3307,
            database: "mailshrimp_test",
            user: "mailshrimp_test",
            password: "database-secret",
        });

        expect(pool).toBe(expectedPool);

        expect(createPoolMock).toHaveBeenCalledTimes(1);
        expect(createPoolMock).toHaveBeenCalledWith({
            host: "127.0.0.1",
            port: 3307,
            database: "mailshrimp_test",
            user: "mailshrimp_test",
            password: "database-secret",
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 100,
            namedPlaceholders: false,

            /*
             * Authentication timestamps must not silently depend on the local
             * timezone of the machine running MailShrimp.
             */
            timezone: "Z",

            dateStrings: false,
        });
    });

    it("uses bounded connection and waiting-queue limits", () => {
        createPoolMock.mockReturnValue({} as Pool);

        createMySqlPool({
            host: "127.0.0.1",
            port: 3306,
            database: "mailshrimp",
            user: "mailshrimp",
            password: "database-secret",
        });

        const firstCall = createPoolMock.mock.calls[0];

        expect(firstCall).toBeDefined();

        const poolOptions = firstCall?.[0];

        expect(poolOptions).toEqual(
            expect.objectContaining({
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 100,
            }),
        );
    });

    it("uses UTC for MySQL date and time conversion", () => {
        createPoolMock.mockReturnValue({} as Pool);

        createMySqlPool({
            host: "127.0.0.1",
            port: 3306,
            database: "mailshrimp",
            user: "mailshrimp",
            password: "database-secret",
        });

        const firstCall = createPoolMock.mock.calls[0];

        expect(firstCall).toBeDefined();

        const poolOptions = firstCall?.[0];

        /*
         * DATETIME columns do not contain timezone information. I require an
         * explicit UTC connection timezone so JavaScript Date conversion behaves
         * consistently on developer machines, CI, and production servers.
         */
        expect(poolOptions).toEqual(
            expect.objectContaining({
                timezone: "Z",
                dateStrings: false,
            }),
        );
    });

    it("passes the database password through without trimming or logging it", () => {
        createPoolMock.mockReturnValue({} as Pool);

        const password = "  database-secret with spaces  ";

        createMySqlPool({
            host: "127.0.0.1",
            port: 3306,
            database: "mailshrimp",
            user: "mailshrimp",
            password,
        });

        const firstCall = createPoolMock.mock.calls[0];

        expect(firstCall).toBeDefined();

        const poolOptions = firstCall?.[0];

        /*
         * Password whitespace can be legitimate, so the configuration layer
         * validates presence without changing the original secret value.
         */
        expect(poolOptions).toEqual(
            expect.objectContaining({
                password,
            }),
        );
    });
});
