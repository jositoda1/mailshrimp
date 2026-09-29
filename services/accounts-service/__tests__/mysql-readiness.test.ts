// services/accounts-service/__tests__/mysql-readiness.test.ts

import { jest } from "@jest/globals";
import type { Pool } from "mysql2/promise";

import { verifyMySqlReadiness } from "../src/database/mysql-readiness.js";

/**
 * Represents only the mysql2 Pool.query signature required by these tests.
 *
 * I type the mock explicitly so Jest does not degrade the query arguments and
 * return value into unsafe or unresolved types during TypeScript and ESLint
 * analysis.
 */
type QueryMock = (sql: string) => Promise<[unknown, unknown]>;

/**
 * Creates the smallest Pool test double needed by verifyMySqlReadiness().
 *
 * I deliberately avoid constructing a real MySQL pool here. These unit tests
 * verify the readiness function's behavior and error propagation without
 * requiring MySQL to be installed or reachable in local development or CI.
 *
 * The cast is restricted to this test-double boundary because the production
 * function accepts the complete mysql2 Pool contract while this unit test only
 * needs query().
 */
function createPoolMock(): {
    pool: Pool;
    query: jest.Mock<QueryMock>;
} {
    const query = jest.fn<QueryMock>();

    return {
        pool: {
            query,
        } as unknown as Pool,
        query,
    };
}

describe("verifyMySqlReadiness", () => {
    it("executes a minimal MySQL connectivity query", async () => {
        const { pool, query } = createPoolMock();

        query.mockResolvedValue([[], []]);

        await expect(verifyMySqlReadiness(pool)).resolves.toBeUndefined();

        /**
         * The readiness probe intentionally uses static SQL and reads no
         * application table. Schema validation remains separate from basic
         * database connectivity.
         */
        expect(query).toHaveBeenCalledTimes(1);
        expect(query).toHaveBeenCalledWith("SELECT 1");
    });

    it("propagates database errors to the startup caller", async () => {
        const { pool, query } = createPoolMock();
        const databaseError = new Error("database unavailable");

        query.mockRejectedValue(databaseError);

        /**
         * I expect the original failure to propagate instead of converting it into
         * a successful readiness result. The executable startup layer can therefore
         * refuse to accept HTTP traffic when MySQL is unavailable.
         */
        await expect(verifyMySqlReadiness(pool)).rejects.toBe(databaseError);

        expect(query).toHaveBeenCalledTimes(1);
    });
});
