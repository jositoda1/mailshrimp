// services/accounts-service/src/auth/session/auth-session.ts

/**
 * Represents the persisted state of a refresh-token session.
 *
 * I keep refresh-session state separate from JWT implementation details
 * because signed refresh tokens alone cannot provide reliable revocation,
 * rotation, or token-reuse detection.
 *
 * Access tokens are intentionally not persisted here. They remain
 * short-lived credentials that can be validated cryptographically.
 */
export interface AuthSession {
  /**
   * Stable identifier for this persisted authentication session.
   *
   * This identifier belongs to MailShrimp and is independent from the
   * account identifier and from any JWT representation.
   */
  id: string;

  /**
   * Identifies the account that owns this session.
   *
   * I preserve the existing MailShrimp account identifier as a number
   * because the original relational accounts model uses an integer
   * primary key.
   */
  accountId: number;

  /**
   * Unique identifier of the refresh token represented by this session.
   *
   * This value is intended to correspond to the JWT "jti" claim. Keeping
   * an explicit token identifier allows the application to distinguish
   * individual refresh tokens issued to the same account.
   */
  tokenId: string;

  /**
   * One-way hash of the refresh token.
   *
   * I do not persist the raw refresh token. If the database is exposed,
   * storing only a one-way representation reduces the usefulness of the
   * stored session data to an attacker.
   */
  tokenHash: string;

  /**
   * Absolute expiration time of the refresh session.
   *
   * The persisted expiration must follow the effective refresh-token
   * lifetime so server-side session validity cannot outlive the token.
   */
  expiresAt: Date;

  /**
   * Time at which this refresh session was revoked.
   *
   * A null value means the session has not been explicitly revoked.
   * Keeping revoked sessions instead of deleting them immediately allows
   * later refresh-token reuse to be detected.
   */
  revokedAt: Date | null;

  /**
   * Token identifier that replaced this refresh token during rotation.
   *
   * A null value means that no replacement token has been recorded.
   * Keeping the replacement relationship provides an audit trail for
   * rotation and helps distinguish normal rotation from token reuse.
   */
  replacedByTokenId: string | null;

  /**
   * Time at which the persisted session was created.
   *
   * These timestamps are part of the domain representation instead of
   * being hidden Sequelize details so repository implementations remain
   * interchangeable.
   */
  createdAt: Date;

  /**
   * Time at which the persisted session was last changed.
   */
  updatedAt: Date;
}