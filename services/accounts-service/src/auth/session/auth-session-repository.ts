// services/accounts-service/src/auth/session/auth-session-repository.ts

import type { AuthSession } from "./auth-session.js";

/**
 * Describes the possible outcomes when attempting to rotate a refresh session.
 *
 * I model the result explicitly because an already-consumed token is
 * security-relevant. It is different from an unknown token and can indicate
 * refresh-token replay or theft.
 */
export type RotateAuthSessionResult =
  | {
      status: "rotated";
    }
  | {
      status: "not_found";
    }
  | {
      status: "already_revoked";
      session: AuthSession;
    }
  | {
      status: "expired";
      session: AuthSession;
    };

/**
 * Defines the persistence operations required by refresh-token sessions.
 *
 * I keep this contract independent from Sequelize so authentication rules
 * can be tested without a real database and so persistence technology does
 * not leak into the authentication domain.
 *
 * Implementations must preserve the security properties documented by each
 * operation. In particular, refresh-token rotation must be atomic so two
 * concurrent uses of the same refresh token cannot both succeed.
 */
export interface AuthSessionRepository {
  /**
   * Persists a newly issued refresh-token session.
   *
   * The repository must never receive or persist the user's password,
   * access token, raw refresh token, or authentication cookie.
   */
  create(session: AuthSession): Promise<void>;

  /**
   * Finds the persisted session represented by a refresh-token identifier.
   *
   * This operation is useful for validation and security investigation, but
   * callers must not implement refresh rotation as a separate
   * "find then revoke" sequence because that would introduce a race condition.
   */
  findByTokenId(tokenId: string): Promise<AuthSession | null>;

  /**
   * Atomically consumes the current refresh session and creates its
   * replacement.
   *
   * Exactly one concurrent caller is allowed to rotate an active session.
   * Once the current session has been consumed, another attempt using the
   * same token must not succeed.
   *
   * The future relational implementation must enforce this guarantee with
   * appropriate database transaction/locking or an equivalent atomic
   * conditional update. Application-level timing checks alone are not enough.
   *
   * Keeping the consumed session allows the authentication layer to
   * distinguish normal rotation from a later replay attempt.
   */
  rotate(
    currentTokenId: string,
    replacement: AuthSession,
    rotatedAt: Date,
  ): Promise<RotateAuthSessionResult>;

  /**
   * Revokes a specific refresh session without issuing a replacement.
   *
   * This is intended for flows such as logout. Revoked records are retained
   * for the required security/audit retention period instead of being
   * immediately deleted.
   */
  revokeByTokenId(tokenId: string, revokedAt: Date): Promise<void>;

  /**
   * Revokes every active refresh session belonging to an account.
   *
   * This supports security responses such as "sign out from all devices"
   * and account-level containment after suspected session compromise.
   *
   * When exposed through an HTTP flow, the account identifier must come from
   * trusted authenticated server-side context. A client-provided account ID
   * must never establish authorization.
   */
  revokeAllForAccount(accountId: number, revokedAt: Date): Promise<void>;
}