-- services/accounts-service/src/database/migrations/001-create-auth-sessions.sql

/*
 * Creates the relational persistence table for refresh-token sessions.
 *
 * I persist refresh-session state because a signed refresh JWT alone cannot
 * provide server-side revocation, atomic rotation, or reliable token-reuse
 * detection.
 *
 * Access tokens are intentionally not stored in this table. They remain
 * short-lived credentials that are validated cryptographically during normal
 * authenticated API requests.
 */
CREATE TABLE auth_sessions (
    /*
     * MailShrimp owns this stable session identifier independently from the
     * account identifier and the JWT token identifier.
     *
     * I reserve enough space for UUID-style identifiers without making the
     * database responsible for generating them. The authentication layer owns
     * identifier generation so repository implementations remain consistent.
     */
    id VARCHAR(36) NOT NULL,

    /*
     * The original MailShrimp accounts model uses an unsigned integer primary
     * key. I preserve that representation in session persistence.
     *
     * A foreign key is intentionally not added in this migration because the
     * rebuilt accounts table is not yet managed by the new migration set.
     * Referential integrity will be added when that table is introduced into
     * the same versioned schema.
     */
    account_id INT UNSIGNED NOT NULL,

    /*
     * token_id corresponds to the refresh JWT "jti" claim.
     *
     * It is unique because one persisted session record represents exactly one
     * issued refresh-token identifier. Rotation and replay detection locate
     * sessions through this value.
     */
    token_id VARCHAR(255) NOT NULL,

    /*
     * Only a one-way representation of the refresh token is persisted.
     *
     * The exact hashing construction is intentionally decided by the
     * authentication layer rather than by this table. Raw refresh tokens must
     * never be written to the database.
     */
    token_hash VARCHAR(255) NOT NULL,

    /*
     * Refresh-session expiration is absolute and follows the effective
     * refresh-token lifetime.
     *
     * DATETIME(3) preserves millisecond precision used by JavaScript Date
     * values without introducing implicit timezone conversion in the column
     * type. Application/database timestamps must therefore use one documented
     * UTC convention.
     */
    expires_at DATETIME(3) NOT NULL,

    /*
     * A null value represents an active session that has not been explicitly
     * revoked. Revoked records are retained so later reuse can be detected.
     */
    revoked_at DATETIME(3) NULL,

    /*
     * Rotation records the token identifier of the replacement session.
     *
     * This remains nullable because newly issued or explicitly revoked
     * sessions do not necessarily have a replacement.
     */
    replaced_by_token_id VARCHAR(255) NULL,

    /*
     * Timestamps are supplied by the application rather than hidden behind an
     * ORM so every AuthSessionRepository implementation exposes the same
     * behavior.
     */
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,

    PRIMARY KEY (id),

    /*
     * The unique index both enforces the token-identifier invariant and
     * supports the lookup used by refresh validation and atomic rotation.
     */
    UNIQUE KEY uq_auth_sessions_token_id (token_id),

    /*
     * Account-level revocation needs to find active sessions for one account
     * efficiently. revoked_at is included because revokeAllForAccount targets
     * rows whose revocation timestamp is still null.
     */
    KEY idx_auth_sessions_account_revoked (account_id, revoked_at),

    /*
     * This index supports expiration-oriented maintenance such as eventually
     * removing old session records according to the retention policy.
     */
    KEY idx_auth_sessions_expires_at (expires_at)
) ENGINE=InnoDB;