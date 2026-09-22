// services/accounts-service/src/auth/session/mysql-auth-session-repository.ts

import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import type { AuthSession } from "./auth-session.js";
import type {
    AuthSessionRepository,
    RotateAuthSessionResult,
} from "./auth-session-repository.js";

/**
 * Represents one auth_sessions row returned by mysql2.
 *
 * I keep the database representation separate from AuthSession because SQL
 * uses snake_case column names while the TypeScript domain model uses
 * camelCase property names.
 */
interface AuthSessionRow extends RowDataPacket {
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
 * Converts a relational database row into the repository's domain shape.
 *
 * I centralize this mapping so every read path applies the same conversion
 * instead of leaking database column naming into authentication code.
 */
function mapAuthSessionRow(row: AuthSessionRow): AuthSession {
    return {
        id: row.id,
        accountId: row.account_id,
        tokenId: row.token_id,
        tokenHash: row.token_hash,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        replacedByTokenId: row.replaced_by_token_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

/**
 * Provides relational persistence for refresh-token authentication sessions.
 *
 * I depend on mysql2's Pool abstraction rather than reading environment
 * variables or creating connections here. Pool creation and environment
 * validation belong to the database/configuration boundary.
 *
 * All SQL values are supplied through positional "?" placeholders. Session
 * identifiers, hashes, account identifiers, and timestamps must never be
 * interpolated directly into SQL strings.
 */
export class MySqlAuthSessionRepository implements AuthSessionRepository {
    public constructor(private readonly pool: Pool) {}

    /**
     * Persists a newly issued refresh-token session.
     *
     * The unique token_id constraint in MySQL protects the invariant that one
     * refresh-token identifier represents exactly one persisted session.
     */
    public async create(session: AuthSession): Promise<void> {
        await this.pool.execute(
            `
        INSERT INTO auth_sessions (
          id,
          account_id,
          token_id,
          token_hash,
          expires_at,
          revoked_at,
          replaced_by_token_id,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
            [
                session.id,
                session.accountId,
                session.tokenId,
                session.tokenHash,
                session.expiresAt,
                session.revokedAt,
                session.replacedByTokenId,
                session.createdAt,
                session.updatedAt,
            ],
        );
    }

    /**
     * Finds a refresh session by its token identifier.
     *
     * This is a normal non-locking lookup. Refresh rotation deliberately uses a
     * separate SELECT ... FOR UPDATE inside a transaction because implementing
     * rotation as "find then update" would create a race condition.
     */
    public async findByTokenId(tokenId: string): Promise<AuthSession | null> {
        const [rows] = await this.pool.execute<AuthSessionRow[]>(
            `
        SELECT
          id,
          account_id,
          token_id,
          token_hash,
          expires_at,
          revoked_at,
          replaced_by_token_id,
          created_at,
          updated_at
        FROM auth_sessions
        WHERE token_id = ?
        LIMIT 1
      `,
            [tokenId],
        );

        const row = rows[0];

        return row === undefined ? null : mapAuthSessionRow(row);
    }

    /**
     * Atomically consumes one active refresh session and creates its replacement.
     *
     * SELECT ... FOR UPDATE obtains an InnoDB row lock for the current session
     * until this transaction finishes. If two requests try to rotate the same
     * refresh token concurrently, the second transaction must wait. After the
     * first transaction commits, the second locking read observes the row as
     * revoked and cannot successfully rotate it again.
     *
     * Unit tests verify that the locking SQL and transaction boundaries are
     * requested. Real lock behavior must still be proven separately by MySQL
     * integration tests because mocks cannot reproduce InnoDB concurrency.
     */
    public async rotate(
        currentTokenId: string,
        replacement: AuthSession,
        rotatedAt: Date,
    ): Promise<RotateAuthSessionResult> {
        const connection = await this.pool.getConnection();

        try {
            await connection.beginTransaction();

            const currentSession = await this.findForUpdate(
                connection,
                currentTokenId,
            );

            if (currentSession === null) {
                await connection.rollback();

                return {
                    status: "not_found",
                };
            }

            /*
             * A revoked row is deliberately retained. Seeing it again is
             * security-relevant because it can represent refresh-token replay.
             */
            if (currentSession.revokedAt !== null) {
                await connection.rollback();

                return {
                    status: "already_revoked",
                    session: currentSession,
                };
            }

            /*
             * Expiration is inclusive: once rotatedAt reaches expiresAt, the
             * refresh session is no longer eligible for rotation.
             */
            if (currentSession.expiresAt.getTime() <= rotatedAt.getTime()) {
                await connection.rollback();

                return {
                    status: "expired",
                    session: currentSession,
                };
            }

            /*
             * Rotation must never be able to transfer a session between accounts.
             * The replacement inherits ownership from the authenticated session;
             * a mismatched account identifier indicates a programming/security
             * invariant violation.
             */
            if (replacement.accountId !== currentSession.accountId) {
                throw new Error(
                    "replacement session must belong to the same account",
                );
            }

            /*
             * I revoke the current row and record its replacement inside the same
             * transaction that inserts the replacement session. If either operation
             * fails, rollback leaves the database in its previous state.
             */
            await connection.execute(
                `
          UPDATE auth_sessions
          SET
            revoked_at = ?,
            replaced_by_token_id = ?,
            updated_at = ?
          WHERE token_id = ?
        `,
                [
                    rotatedAt,
                    replacement.tokenId,
                    rotatedAt,
                    currentSession.tokenId,
                ],
            );

            await this.insertWithConnection(connection, replacement);

            await connection.commit();

            return {
                status: "rotated",
            };
        } catch (error) {
            /*
             * Any unexpected SQL or invariant failure must abort the complete
             * rotation. In particular, a failed replacement INSERT must not leave
             * the original session permanently revoked.
             */
            await connection.rollback();

            throw error;
        } finally {
            /*
             * Pooled connections must always be returned to the pool, including
             * error and early-return paths. Failing to release connections would
             * eventually exhaust the bounded pool.
             */
            connection.release();
        }
    }

    /**
     * Revokes one active refresh session.
     *
     * revoked_at IS NULL makes this operation idempotent and preserves the first
     * revocation timestamp if logout or another security action is repeated.
     */
    public async revokeByTokenId(
        tokenId: string,
        revokedAt: Date,
    ): Promise<void> {
        await this.pool.execute(
            `
        UPDATE auth_sessions
        SET
          revoked_at = ?,
          updated_at = ?
        WHERE token_id = ?
          AND revoked_at IS NULL
      `,
            [revokedAt, revokedAt, tokenId],
        );
    }

    /**
     * Revokes every currently active refresh session owned by one account.
     *
     * The repository only performs persistence. HTTP authorization code must
     * obtain accountId from trusted authenticated server-side context rather
     * than treating a client-supplied account identifier as authorization.
     */
    public async revokeAllForAccount(
        accountId: number,
        revokedAt: Date,
    ): Promise<void> {
        await this.pool.execute(
            `
        UPDATE auth_sessions
        SET
          revoked_at = ?,
          updated_at = ?
        WHERE account_id = ?
          AND revoked_at IS NULL
      `,
            [revokedAt, revokedAt, accountId],
        );
    }

    /**
     * Reads the current session while holding an exclusive row lock for the
     * duration of the surrounding transaction.
     */
    private async findForUpdate(
        connection: PoolConnection,
        tokenId: string,
    ): Promise<AuthSession | null> {
        const [rows] = await connection.execute<AuthSessionRow[]>(
            `
        SELECT
          id,
          account_id,
          token_id,
          token_hash,
          expires_at,
          revoked_at,
          replaced_by_token_id,
          created_at,
          updated_at
        FROM auth_sessions
        WHERE token_id = ?
        LIMIT 1
        FOR UPDATE
      `,
            [tokenId],
        );

        const row = rows[0];

        return row === undefined ? null : mapAuthSessionRow(row);
    }

    /**
     * Inserts a session through an existing transaction connection.
     *
     * I keep this separate from create() because calling pool.execute() during
     * rotation could use another pooled connection and therefore escape the
     * transaction protecting the current session.
     */
    private async insertWithConnection(
        connection: PoolConnection,
        session: AuthSession,
    ): Promise<void> {
        await connection.execute(
            `
        INSERT INTO auth_sessions (
          id,
          account_id,
          token_id,
          token_hash,
          expires_at,
          revoked_at,
          replaced_by_token_id,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
            [
                session.id,
                session.accountId,
                session.tokenId,
                session.tokenHash,
                session.expiresAt,
                session.revokedAt,
                session.replacedByTokenId,
                session.createdAt,
                session.updatedAt,
            ],
        );
    }
}
