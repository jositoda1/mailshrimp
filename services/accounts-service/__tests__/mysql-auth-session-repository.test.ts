// services/accounts-service/__tests__/mysql-auth-session-repository.test.ts

import { jest } from "@jest/globals";
import type { Pool, PoolConnection } from "mysql2/promise";

import type { AuthSession } from "../src/auth/session/auth-session.js";
import { MySqlAuthSessionRepository } from "../src/auth/session/mysql-auth-session-repository.js";

/**
 * Represents the subset of mysql2 execute behavior required by these unit
 * tests.
 *
 * I type the mock explicitly instead of relying on an untyped jest.fn().
 * This keeps SQL strings, parameter arrays, and resolved query results visible
 * to TypeScript and ESLint rather than degrading them into unsafe values.
 */
type ExecuteMock = (
    sql: string,
    parameters?: readonly unknown[],
) => Promise<[unknown, unknown]>;

/**
 * Represents an asynchronous mysql2 transaction operation such as begin,
 * commit, or rollback.
 */
type AsyncTransactionMock = () => Promise<void>;

/**
 * Represents Pool.getConnection() for the behavior exercised here.
 */
type GetConnectionMock = () => Promise<PoolConnection>;

/**
 * Represents one database-shaped session row used by the test doubles.
 *
 * I keep this separate from AuthSession because the relational representation
 * uses snake_case column names while the domain object uses camelCase.
 */
interface AuthSessionDatabaseRow {
    id: string;
    account_id: number;
    token_id: string;
    token_hash: string;
    expires_at: Date;
    revoked_at: Date | null;
    replaced_by_token_id: string | null;
    created_at: Date;
    updated_at: Date;
}

/**
 * Describes the pool test double returned by createPoolMock().
 *
 * Explicitly typing this object satisfies the project's
 * explicit-function-return-type rule and keeps Jest mock calls type-safe.
 */
interface PoolMock {
    pool: Pool;
    execute: jest.Mock<ExecuteMock>;
    getConnection: jest.Mock<GetConnectionMock>;
}

/**
 * Describes the transaction connection test double.
 *
 * Every mocked operation has the same signature expected by the repository
 * behavior under test.
 */
interface ConnectionMock {
    connection: PoolConnection;
    beginTransaction: jest.Mock<AsyncTransactionMock>;
    execute: jest.Mock<ExecuteMock>;
    commit: jest.Mock<AsyncTransactionMock>;
    rollback: jest.Mock<AsyncTransactionMock>;
    release: jest.Mock<() => void>;
}

/*
 * These tests isolate repository behavior from a real MySQL server.
 *
 * I mock Pool and PoolConnection because I want to verify SQL shape,
 * parameter binding, transaction boundaries, rollback behavior, and
 * connection release deterministically.
 *
 * These unit tests do not prove InnoDB row-locking behavior under real
 * concurrency. That requires separate integration tests against MySQL.
 */
function createSession(overrides: Partial<AuthSession> = {}): AuthSession {
    return {
        id: "11111111-1111-4111-8111-111111111111",
        accountId: 42,
        tokenId: "refresh-token-id-1",
        tokenHash: "hashed-refresh-token-1",
        expiresAt: new Date("2026-10-01T12:00:00.000Z"),
        revokedAt: null,
        replacedByTokenId: null,
        createdAt: new Date("2026-09-22T12:00:00.000Z"),
        updatedAt: new Date("2026-09-22T12:00:00.000Z"),
        ...overrides,
    };
}

/**
 * Converts a domain session into the snake_case database representation used
 * by mysql2 query mocks.
 */
function createDatabaseRow(session: AuthSession): AuthSessionDatabaseRow {
    return {
        id: session.id,
        account_id: session.accountId,
        token_id: session.tokenId,
        token_hash: session.tokenHash,
        expires_at: session.expiresAt,
        revoked_at: session.revokedAt,
        replaced_by_token_id: session.replacedByTokenId,
        created_at: session.createdAt,
        updated_at: session.updatedAt,
    };
}

/**
 * Creates the Pool behavior required by the repository tests.
 *
 * I include getConnection from the beginning instead of assigning a Jest mock
 * over pool.getConnection later. That avoids unsafe casts to jest.Mock and
 * gives every test a correctly typed connection factory.
 */
function createPoolMock(): PoolMock {
    const execute = jest.fn<ExecuteMock>();
    const getConnection = jest.fn<GetConnectionMock>();

    /*
     * The production repository accepts the complete mysql2 Pool interface.
     * Unit tests only need execute() and getConnection(), so this test double
     * deliberately implements that smaller runtime surface.
     */
    const pool = {
        execute,
        getConnection,
    } as unknown as Pool;

    return {
        pool,
        execute,
        getConnection,
    };
}

/**
 * Creates the transaction connection behavior required by rotate().
 *
 * Each Jest function has an explicit signature so calls and resolved values
 * remain type-safe during linting and type checking.
 */
function createConnectionMock(): ConnectionMock {
    const beginTransaction = jest.fn<AsyncTransactionMock>();
    const execute = jest.fn<ExecuteMock>();
    const commit = jest.fn<AsyncTransactionMock>();
    const rollback = jest.fn<AsyncTransactionMock>();
    const release = jest.fn<() => void>();

    const connection = {
        beginTransaction,
        execute,
        commit,
        rollback,
        release,
    } as unknown as PoolConnection;

    return {
        connection,
        beginTransaction,
        execute,
        commit,
        rollback,
        release,
    };
}

describe("MySqlAuthSessionRepository", () => {
    describe("create", () => {
        it("inserts the complete session using parameterized SQL", async () => {
            const { pool, execute } = createPoolMock();
            const repository = new MySqlAuthSessionRepository(pool);
            const session = createSession();

            execute.mockResolvedValueOnce([{}, []]);

            await repository.create(session);

            expect(execute).toHaveBeenCalledTimes(1);

            const firstCall = execute.mock.calls[0];

            expect(firstCall).toBeDefined();

            const sql = firstCall?.[0];
            const parameters = firstCall?.[1];

            expect(sql).toContain("INSERT INTO auth_sessions");
            expect(sql).toContain("?");

            /*
             * I verify values separately from the SQL text because session data must
             * be passed through mysql2 parameter binding instead of interpolated into
             * SQL strings.
             */
            expect(parameters).toEqual([
                session.id,
                session.accountId,
                session.tokenId,
                session.tokenHash,
                session.expiresAt,
                session.revokedAt,
                session.replacedByTokenId,
                session.createdAt,
                session.updatedAt,
            ]);

            expect(sql).not.toContain(session.tokenId);
            expect(sql).not.toContain(session.tokenHash);
        });
    });

    describe("findByTokenId", () => {
        it("returns null when the token identifier does not exist", async () => {
            const { pool, execute } = createPoolMock();
            const repository = new MySqlAuthSessionRepository(pool);

            execute.mockResolvedValueOnce([[], []]);

            await expect(
                repository.findByTokenId("missing-token-id"),
            ).resolves.toBeNull();

            const firstCall = execute.mock.calls[0];

            expect(firstCall).toBeDefined();

            const sql = firstCall?.[0];
            const parameters = firstCall?.[1];

            expect(sql).toContain("FROM auth_sessions");
            expect(sql).toContain("token_id = ?");
            expect(parameters).toEqual(["missing-token-id"]);
        });

        it("maps a database row to the AuthSession domain shape", async () => {
            const { pool, execute } = createPoolMock();
            const repository = new MySqlAuthSessionRepository(pool);
            const session = createSession();

            execute.mockResolvedValueOnce([[createDatabaseRow(session)], []]);

            await expect(
                repository.findByTokenId(session.tokenId),
            ).resolves.toEqual(session);
        });
    });

    describe("rotate", () => {
        it("returns not_found and rolls back when the current session does not exist", async () => {
            const { pool, getConnection } = createPoolMock();
            const mocks = createConnectionMock();

            getConnection.mockResolvedValueOnce(mocks.connection);

            const repository = new MySqlAuthSessionRepository(pool);

            const replacement = createSession({
                id: "22222222-2222-4222-8222-222222222222",
                tokenId: "refresh-token-id-2",
                tokenHash: "hashed-refresh-token-2",
            });

            mocks.execute.mockResolvedValueOnce([[], []]);

            await expect(
                repository.rotate(
                    "missing-token-id",
                    replacement,
                    new Date("2026-09-22T13:00:00.000Z"),
                ),
            ).resolves.toEqual({
                status: "not_found",
            });

            expect(mocks.beginTransaction).toHaveBeenCalledTimes(1);
            expect(mocks.rollback).toHaveBeenCalledTimes(1);
            expect(mocks.commit).not.toHaveBeenCalled();
            expect(mocks.release).toHaveBeenCalledTimes(1);

            const firstCall = mocks.execute.mock.calls[0];

            expect(firstCall).toBeDefined();

            const sql = firstCall?.[0];

            /*
             * The locking read is the database-side protection that prevents two
             * concurrent refresh attempts from both consuming the same active row.
             */
            expect(sql).toContain("FOR UPDATE");
        });

        it("returns already_revoked without creating another replacement", async () => {
            const { pool, getConnection } = createPoolMock();
            const mocks = createConnectionMock();

            getConnection.mockResolvedValueOnce(mocks.connection);

            const repository = new MySqlAuthSessionRepository(pool);

            const revokedSession = createSession({
                revokedAt: new Date("2026-09-22T12:30:00.000Z"),
                replacedByTokenId: "refresh-token-id-previous-replacement",
            });

            const replacement = createSession({
                id: "22222222-2222-4222-8222-222222222222",
                tokenId: "refresh-token-id-2",
                tokenHash: "hashed-refresh-token-2",
            });

            mocks.execute.mockResolvedValueOnce([
                [createDatabaseRow(revokedSession)],
                [],
            ]);

            await expect(
                repository.rotate(
                    revokedSession.tokenId,
                    replacement,
                    new Date("2026-09-22T13:00:00.000Z"),
                ),
            ).resolves.toEqual({
                status: "already_revoked",
                session: revokedSession,
            });

            expect(mocks.execute).toHaveBeenCalledTimes(1);
            expect(mocks.rollback).toHaveBeenCalledTimes(1);
            expect(mocks.commit).not.toHaveBeenCalled();
            expect(mocks.release).toHaveBeenCalledTimes(1);
        });

        it("returns expired when the current session has reached its absolute expiry", async () => {
            const { pool, getConnection } = createPoolMock();
            const mocks = createConnectionMock();

            getConnection.mockResolvedValueOnce(mocks.connection);

            const repository = new MySqlAuthSessionRepository(pool);

            const expiredSession = createSession({
                expiresAt: new Date("2026-09-22T13:00:00.000Z"),
            });

            const replacement = createSession({
                id: "22222222-2222-4222-8222-222222222222",
                tokenId: "refresh-token-id-2",
            });

            mocks.execute.mockResolvedValueOnce([
                [createDatabaseRow(expiredSession)],
                [],
            ]);

            await expect(
                repository.rotate(
                    expiredSession.tokenId,
                    replacement,
                    new Date("2026-09-22T13:00:00.000Z"),
                ),
            ).resolves.toEqual({
                status: "expired",
                session: expiredSession,
            });

            expect(mocks.execute).toHaveBeenCalledTimes(1);
            expect(mocks.rollback).toHaveBeenCalledTimes(1);
            expect(mocks.commit).not.toHaveBeenCalled();
            expect(mocks.release).toHaveBeenCalledTimes(1);
        });

        it("rejects a replacement belonging to another account", async () => {
            const { pool, getConnection } = createPoolMock();
            const mocks = createConnectionMock();

            getConnection.mockResolvedValueOnce(mocks.connection);

            const repository = new MySqlAuthSessionRepository(pool);

            const currentSession = createSession({
                accountId: 42,
            });

            const replacement = createSession({
                id: "22222222-2222-4222-8222-222222222222",
                accountId: 99,
                tokenId: "refresh-token-id-2",
            });

            mocks.execute.mockResolvedValueOnce([
                [createDatabaseRow(currentSession)],
                [],
            ]);

            await expect(
                repository.rotate(
                    currentSession.tokenId,
                    replacement,
                    new Date("2026-09-22T13:00:00.000Z"),
                ),
            ).rejects.toThrow(
                "replacement session must belong to the same account",
            );

            expect(mocks.rollback).toHaveBeenCalledTimes(1);
            expect(mocks.commit).not.toHaveBeenCalled();
            expect(mocks.release).toHaveBeenCalledTimes(1);
        });

        it("atomically revokes the current session and inserts its replacement", async () => {
            const { pool, execute, getConnection } = createPoolMock();
            const mocks = createConnectionMock();

            getConnection.mockResolvedValueOnce(mocks.connection);

            const repository = new MySqlAuthSessionRepository(pool);

            const currentSession = createSession();

            const replacement = createSession({
                id: "22222222-2222-4222-8222-222222222222",
                tokenId: "refresh-token-id-2",
                tokenHash: "hashed-refresh-token-2",
                createdAt: new Date("2026-09-22T13:00:00.000Z"),
                updatedAt: new Date("2026-09-22T13:00:00.000Z"),
            });

            const rotatedAt = new Date("2026-09-22T13:00:00.000Z");

            mocks.execute
                .mockResolvedValueOnce([
                    [createDatabaseRow(currentSession)],
                    [],
                ])
                .mockResolvedValueOnce([{}, []])
                .mockResolvedValueOnce([{}, []]);

            await expect(
                repository.rotate(
                    currentSession.tokenId,
                    replacement,
                    rotatedAt,
                ),
            ).resolves.toEqual({
                status: "rotated",
            });

            expect(mocks.beginTransaction).toHaveBeenCalledTimes(1);
            expect(mocks.execute).toHaveBeenCalledTimes(3);
            expect(mocks.commit).toHaveBeenCalledTimes(1);
            expect(mocks.rollback).not.toHaveBeenCalled();
            expect(mocks.release).toHaveBeenCalledTimes(1);

            /*
             * Rotation must remain on the same checked-out PoolConnection for the
             * locking read, current-session update, and replacement insert. Calling
             * pool.execute() here could run outside the transaction on another
             * pooled connection.
             */
            expect(execute).not.toHaveBeenCalled();

            const lockingCall = mocks.execute.mock.calls[0];
            const updateCall = mocks.execute.mock.calls[1];
            const insertCall = mocks.execute.mock.calls[2];

            expect(lockingCall).toBeDefined();
            expect(updateCall).toBeDefined();
            expect(insertCall).toBeDefined();

            const lockingSql = lockingCall?.[0];
            const lockingParameters = lockingCall?.[1];

            const updateSql = updateCall?.[0];
            const updateParameters = updateCall?.[1];

            const insertSql = insertCall?.[0];
            const insertParameters = insertCall?.[1];

            expect(lockingSql).toContain("FOR UPDATE");
            expect(lockingParameters).toEqual([currentSession.tokenId]);

            expect(updateSql).toContain("UPDATE auth_sessions");
            expect(updateSql).toContain("revoked_at = ?");
            expect(updateSql).toContain("replaced_by_token_id = ?");
            expect(updateParameters).toEqual([
                rotatedAt,
                replacement.tokenId,
                rotatedAt,
                currentSession.tokenId,
            ]);

            expect(insertSql).toContain("INSERT INTO auth_sessions");
            expect(insertParameters).toEqual([
                replacement.id,
                replacement.accountId,
                replacement.tokenId,
                replacement.tokenHash,
                replacement.expiresAt,
                replacement.revokedAt,
                replacement.replacedByTokenId,
                replacement.createdAt,
                replacement.updatedAt,
            ]);
        });

        it("rolls back and releases the connection when rotation fails", async () => {
            const { pool, getConnection } = createPoolMock();
            const mocks = createConnectionMock();

            getConnection.mockResolvedValueOnce(mocks.connection);

            const repository = new MySqlAuthSessionRepository(pool);

            const currentSession = createSession();

            const replacement = createSession({
                id: "22222222-2222-4222-8222-222222222222",
                tokenId: "refresh-token-id-2",
            });

            const databaseError = new Error("database insert failed");

            mocks.execute
                .mockResolvedValueOnce([
                    [createDatabaseRow(currentSession)],
                    [],
                ])
                .mockResolvedValueOnce([{}, []])
                .mockRejectedValueOnce(databaseError);

            await expect(
                repository.rotate(
                    currentSession.tokenId,
                    replacement,
                    new Date("2026-09-22T13:00:00.000Z"),
                ),
            ).rejects.toBe(databaseError);

            expect(mocks.rollback).toHaveBeenCalledTimes(1);
            expect(mocks.commit).not.toHaveBeenCalled();
            expect(mocks.release).toHaveBeenCalledTimes(1);
        });
    });

    describe("revokeByTokenId", () => {
        it("revokes only an active matching session", async () => {
            const { pool, execute } = createPoolMock();
            const repository = new MySqlAuthSessionRepository(pool);
            const revokedAt = new Date("2026-09-22T14:00:00.000Z");

            execute.mockResolvedValueOnce([{}, []]);

            await repository.revokeByTokenId("refresh-token-id-1", revokedAt);

            const firstCall = execute.mock.calls[0];

            expect(firstCall).toBeDefined();

            const sql = firstCall?.[0];
            const parameters = firstCall?.[1];

            expect(sql).toContain("UPDATE auth_sessions");
            expect(sql).toContain("token_id = ?");
            expect(sql).toContain("revoked_at IS NULL");
            expect(parameters).toEqual([
                revokedAt,
                revokedAt,
                "refresh-token-id-1",
            ]);
        });
    });

    describe("revokeAllForAccount", () => {
        it("revokes only active sessions belonging to the requested account", async () => {
            const { pool, execute } = createPoolMock();
            const repository = new MySqlAuthSessionRepository(pool);
            const revokedAt = new Date("2026-09-22T14:00:00.000Z");

            execute.mockResolvedValueOnce([{}, []]);

            await repository.revokeAllForAccount(42, revokedAt);

            const firstCall = execute.mock.calls[0];

            expect(firstCall).toBeDefined();

            const sql = firstCall?.[0];
            const parameters = firstCall?.[1];

            expect(sql).toContain("UPDATE auth_sessions");
            expect(sql).toContain("account_id = ?");
            expect(sql).toContain("revoked_at IS NULL");
            expect(parameters).toEqual([revokedAt, revokedAt, 42]);
        });
    });
});
