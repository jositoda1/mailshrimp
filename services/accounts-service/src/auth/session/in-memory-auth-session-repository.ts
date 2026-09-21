// services/accounts-service/src/auth/session/in-memory-auth-session-repository.ts

import type {
    AuthSessionRepository,
    RotateAuthSessionResult,
} from "./auth-session-repository.js";
import type { AuthSession } from "./auth-session.js";

/**
 * In-memory implementation of the refresh-session repository.
 *
 * I use this implementation to test authentication/session behavior without
 * requiring MySQL. Production persistence will use the relational database.
 *
 * This repository deliberately stores copies of session objects instead of
 * exposing its internal objects directly. That prevents callers from changing
 * persisted state accidentally by mutating an object returned by the
 * repository.
 */
export class InMemoryAuthSessionRepository implements AuthSessionRepository {
    private readonly sessions = new Map<string, AuthSession>();

    /**
     * Serializes mutations performed by this in-memory repository.
     *
     * JavaScript does not provide database transactions for a Map. I keep a
     * small mutation queue so concurrent test calls cannot both observe the same
     * refresh session as active and successfully rotate it.
     *
     * This models the atomicity guarantee required from the future relational
     * implementation. Production code must provide that guarantee with database
     * transactions, locking, or an equivalent atomic conditional operation.
     */
    private mutationQueue: Promise<void> = Promise.resolve();

    /**
     * Creates a defensive copy of a session.
     *
     * Date instances are mutable objects, so copying only the outer object would
     * still allow a caller to mutate timestamps held by the repository.
     */
    private cloneSession(session: AuthSession): AuthSession {
        return {
            ...session,
            expiresAt: new Date(session.expiresAt),
            revokedAt:
                session.revokedAt === null ? null : new Date(session.revokedAt),
            createdAt: new Date(session.createdAt),
            updatedAt: new Date(session.updatedAt),
        };
    }

    /**
     * Runs a state-changing operation exclusively.
     *
     * The queue is intentionally private infrastructure for this test
     * repository. Authentication services should depend only on the repository
     * contract and must not know how atomicity is implemented.
     */
    private async runExclusive<T>(operation: () => T | Promise<T>): Promise<T> {
        const previousMutation = this.mutationQueue;

        let releaseCurrentMutation!: () => void;

        this.mutationQueue = new Promise<void>((resolve) => {
            releaseCurrentMutation = resolve;
        });

        await previousMutation;

        try {
            return await operation();
        } finally {
            releaseCurrentMutation();
        }
    }

    /**
     * Persists a new refresh session.
     *
     * A token identifier must be unique. Accepting a duplicate token ID would
     * make it ambiguous which persisted session a refresh JWT represents.
     */
    async create(session: AuthSession): Promise<void> {
        await this.runExclusive(() => {
            if (this.sessions.has(session.tokenId)) {
                throw new Error(
                    `Auth session token ID already exists: ${session.tokenId}`,
                );
            }

            this.sessions.set(session.tokenId, this.cloneSession(session));
        });
    }

    /**
     * Returns the session associated with a refresh-token identifier.
     *
     * This method does not mutate session state and must not be used as the
     * first half of a non-atomic "find then rotate" flow.
     *
     * I return an explicit Promise because the repository contract is
     * asynchronous for compatibility with the future relational implementation.
     * The in-memory lookup itself is synchronous, so marking this method `async`
     * would add no asynchronous work and would violate the project's lint rule
     * that requires async functions to contain an await expression.
     */
    findByTokenId(tokenId: string): Promise<AuthSession | null> {
        const session = this.sessions.get(tokenId);

        return Promise.resolve(
            session === undefined ? null : this.cloneSession(session),
        );
    }

    /**
     * Atomically consumes one refresh session and creates its replacement.
     *
     * Only an existing, unexpired and non-revoked session can be rotated.
     * Keeping the old session with revokedAt and replacedByTokenId preserves
     * the evidence required for later replay/reuse detection.
     */
    async rotate(
        currentTokenId: string,
        replacement: AuthSession,
        rotatedAt: Date,
    ): Promise<RotateAuthSessionResult> {
        return this.runExclusive(() => {
            const current = this.sessions.get(currentTokenId);

            if (current === undefined) {
                return {
                    status: "not_found",
                };
            }

            if (current.revokedAt !== null) {
                return {
                    status: "already_revoked",
                    session: this.cloneSession(current),
                };
            }

            if (current.expiresAt.getTime() <= rotatedAt.getTime()) {
                return {
                    status: "expired",
                    session: this.cloneSession(current),
                };
            }

            if (this.sessions.has(replacement.tokenId)) {
                throw new Error(
                    `Replacement auth session token ID already exists: ${replacement.tokenId}`,
                );
            }

            /**
             * A rotation must not move a refresh token to another account.
             *
             * The account ID ultimately originates from authenticated token/session
             * state, not from a client-provided account ID. Enforcing the invariant
             * here adds another layer of protection against cross-account mistakes.
             */
            if (replacement.accountId !== current.accountId) {
                throw new Error(
                    "A refresh-session replacement must belong to the same account.",
                );
            }

            const revokedCurrent: AuthSession = {
                ...current,
                revokedAt: new Date(rotatedAt),
                replacedByTokenId: replacement.tokenId,
                updatedAt: new Date(rotatedAt),
            };

            this.sessions.set(
                currentTokenId,
                this.cloneSession(revokedCurrent),
            );

            this.sessions.set(
                replacement.tokenId,
                this.cloneSession(replacement),
            );

            return {
                status: "rotated",
            };
        });
    }

    /**
     * Revokes one refresh session without issuing another refresh token.
     *
     * This operation is intentionally idempotent. Repeating logout must not
     * change the original revocation timestamp or reactivate the session.
     */
    async revokeByTokenId(tokenId: string, revokedAt: Date): Promise<void> {
        await this.runExclusive(() => {
            const session = this.sessions.get(tokenId);

            if (session === undefined || session.revokedAt !== null) {
                return;
            }

            this.sessions.set(
                tokenId,
                this.cloneSession({
                    ...session,
                    revokedAt: new Date(revokedAt),
                    updatedAt: new Date(revokedAt),
                }),
            );
        });
    }

    /**
     * Revokes all currently active refresh sessions owned by one account.
     *
     * Sessions belonging to other accounts are deliberately untouched. This
     * invariant is important because account-scoped security actions must never
     * cross tenant/account boundaries.
     */
    async revokeAllForAccount(
        accountId: number,
        revokedAt: Date,
    ): Promise<void> {
        await this.runExclusive(() => {
            for (const [tokenId, session] of this.sessions.entries()) {
                if (
                    session.accountId !== accountId ||
                    session.revokedAt !== null
                ) {
                    continue;
                }

                this.sessions.set(
                    tokenId,
                    this.cloneSession({
                        ...session,
                        revokedAt: new Date(revokedAt),
                        updatedAt: new Date(revokedAt),
                    }),
                );
            }
        });
    }
}
