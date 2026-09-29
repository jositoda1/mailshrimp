// services/accounts-service/__tests__/service-shutdown.test.ts

import { jest } from "@jest/globals";
import type { Server } from "node:http";
import type { Pool } from "mysql2/promise";

/**
 * Represents the MySQL lifecycle function used by service shutdown.
 *
 * I mock this dependency so the test can verify resource-cleanup ordering
 * without creating or closing a real MySQL connection pool.
 */
type CloseMySqlMock = (pool: Pool) => Promise<void>;

const closeMySqlMock = jest.fn<CloseMySqlMock>();

/**
 * ESM modules bind their imports during module initialization.
 *
 * I register the MySQL lifecycle mock before importing service-shutdown.ts so
 * the module under test receives this controlled test dependency instead of
 * the production closeMySql() implementation.
 */
jest.unstable_mockModule("../src/database/mysql-lifecycle.js", () => ({
    closeMySql: closeMySqlMock,
}));

const { shutdownService } = await import("../src/service-shutdown.js");

/**
 * Represents the specific Server.close() shape exercised by this unit test.
 *
 * I type the mock explicitly instead of using jest.Mock without a function
 * signature. Jest's generic Mock type otherwise defaults to UnknownFunction,
 * which is intentionally too broad to represent this callback contract safely
 * during TypeScript analysis.
 */
type HttpServerCloseMock = (callback: (error?: Error) => void) => Server;

function createHttpServerMock(): {
    httpServer: Server;
    completeClose: (error?: Error) => void;
    close: jest.Mock<HttpServerCloseMock>;
} {
    let closeCallback: ((error?: Error) => void) | undefined;

    const close = jest.fn((callback: (error?: Error) => void) => {
        closeCallback = callback;

        return {} as Server;
    });

    return {
        httpServer: {
            close,
        } as unknown as Server,

        completeClose(error?: Error): void {
            if (closeCallback === undefined) {
                throw new Error(
                    "HTTP close callback was completed before server.close() was called.",
                );
            }

            closeCallback(error);
        },

        close,
    };
}

/**
 * Creates the smallest MySQL Pool test double required by shutdownService().
 *
 * closeMySql() is mocked in this test suite, so the pool itself does not need
 * to implement database behavior.
 */
function createDatabasePoolMock(): Pool {
    return {} as Pool;
}

describe("shutdownService", () => {
    beforeEach(() => {
        closeMySqlMock.mockReset();
    });

    it("closes MySQL only after the HTTP server finishes closing", async () => {
        const { httpServer, completeClose, close } = createHttpServerMock();
        const databasePool = createDatabasePoolMock();

        closeMySqlMock.mockResolvedValue();

        const shutdownPromise = shutdownService(
            {
                httpServer,
                databasePool,
            },
            "SIGTERM",
        );

        /**
         * server.close() must be requested immediately so the service stops
         * accepting new HTTP work when graceful shutdown begins.
         */
        expect(close).toHaveBeenCalledTimes(1);

        /**
         * The database must remain available while HTTP shutdown is still pending.
         * Existing requests may still require persistence during this interval.
         */
        expect(closeMySqlMock).not.toHaveBeenCalled();

        completeClose();

        await expect(shutdownPromise).resolves.toBeUndefined();

        expect(closeMySqlMock).toHaveBeenCalledTimes(1);
        expect(closeMySqlMock).toHaveBeenCalledWith(databasePool);
    });

    it("does not close MySQL when HTTP shutdown fails", async () => {
        const { httpServer, completeClose } = createHttpServerMock();
        const databasePool = createDatabasePoolMock();
        const httpError = new Error("HTTP server failed to close");

        const shutdownPromise = shutdownService(
            {
                httpServer,
                databasePool,
            },
            "SIGINT",
        );

        /**
         * A failed HTTP shutdown leaves the ordering guarantee incomplete.
         *
         * I preserve that failure and do not close MySQL underneath a server whose
         * shutdown did not successfully complete.
         */
        completeClose(httpError);

        await expect(shutdownPromise).rejects.toBe(httpError);

        expect(closeMySqlMock).not.toHaveBeenCalled();
    });

    it("propagates MySQL shutdown errors after HTTP closes successfully", async () => {
        const { httpServer, completeClose } = createHttpServerMock();
        const databasePool = createDatabasePoolMock();
        const databaseError = new Error("database pool close failed");

        closeMySqlMock.mockRejectedValue(databaseError);

        const shutdownPromise = shutdownService(
            {
                httpServer,
                databasePool,
            },
            "SIGTERM",
        );

        completeClose();

        /**
         * MySQL shutdown failures remain visible to the executable boundary so
         * server.ts can log the failure and set an unsuccessful process exit code.
         */
        await expect(shutdownPromise).rejects.toBe(databaseError);

        expect(closeMySqlMock).toHaveBeenCalledTimes(1);
        expect(closeMySqlMock).toHaveBeenCalledWith(databasePool);
    });
});
