// services/accounts-service/src/auth/token-service.ts

import { SignJWT, jwtVerify } from "jose";

/**
 * Token types supported by the accounts service.
 *
 * I include the token type as a signed claim so an access token cannot be
 * accepted by refresh-token logic, or vice versa, merely because both tokens
 * are structurally valid JWTs.
 */
export type AuthenticationTokenType = "access" | "refresh";

/**
 * Claims that MailShrimp requires from a verified authentication token.
 *
 * `sub` identifies the authenticated account. The remaining standard JWT
 * timing claims are added and validated by jose.
 */
export interface AuthenticationTokenClaims {
  sub: string;
  tokenType: AuthenticationTokenType;
}

/**
 * Signing credentials required by the token service.
 *
 * I inject secrets into this module instead of reading process.env here.
 * Environment access and validation belong to the configuration layer, while
 * this module is responsible only for token cryptography and token semantics.
 */
export interface TokenServiceSecrets {
  accessTokenSecret: string;
  refreshTokenSecret: string;
}

/**
 * Token lifetimes required by the token service.
 *
 * I inject validated lifetimes instead of importing fixed global values. This
 * lets each deployment configure its authentication policy through the
 * environment without coupling token cryptography to process.env.
 *
 * The property names include the unit explicitly because JWT expiration uses
 * seconds while other authentication components, such as cookies, may use
 * milliseconds.
 */
export interface TokenServiceLifetimes {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
}

/**
 * Public operations exposed by the authentication token service.
 *
 * Keeping the interface small makes the intended security boundary explicit:
 * callers can issue or verify one of the two supported token classes without
 * handling signing keys directly.
 */
export interface TokenService {
  createAccessToken(accountId: string): Promise<string>;
  createRefreshToken(accountId: string): Promise<string>;
  verifyAccessToken(token: string): Promise<AuthenticationTokenClaims>;
  verifyRefreshToken(token: string): Promise<AuthenticationTokenClaims>;
}

/**
 * Converts a configured signing secret into bytes for HMAC operations.
 *
 * jose expects binary key material when using an HMAC algorithm. TextEncoder
 * provides a deterministic UTF-8 representation without introducing another
 * dependency.
 */
function encodeSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * Creates the MailShrimp authentication token service.
 *
 * I use HS256 for this initial single-service signing boundary. Access and
 * refresh tokens use separate secrets even though they use the same algorithm.
 * This prevents one token class from being verified with the other class's
 * signing credential.
 *
 * Secrets and token lifetimes are injected independently because they represent
 * different configuration concerns: secrets are cryptographic credentials,
 * while lifetimes are authentication policy. Both are validated by the
 * configuration layer before reaching this service.
 *
 * If token verification later needs to cross independently deployed trust
 * boundaries, I can revisit this decision and move to asymmetric signing
 * without changing the HTTP authentication contract.
 */
export function createTokenService(
  secrets: TokenServiceSecrets,
  lifetimes: TokenServiceLifetimes,
): TokenService {
  const accessTokenKey = encodeSecret(secrets.accessTokenSecret);
  const refreshTokenKey = encodeSecret(secrets.refreshTokenSecret);

  /**
   * Creates a signed JWT with the claims shared by both token classes.
   *
   * I set issued-at and expiration through jose rather than calculating an
   * absolute timestamp manually. The token type is signed into the JWT and is
   * checked again after cryptographic verification.
   */
  async function createToken(
    accountId: string,
    tokenType: AuthenticationTokenType,
    key: Uint8Array,
    ttlSeconds: number,
  ): Promise<string> {
    return new SignJWT({ tokenType })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(accountId)
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(key);
  }

  /**
   * Verifies signature, expiration, subject, and MailShrimp token type.
   *
   * I explicitly restrict verification to HS256. This prevents the verifier
   * from accepting a token that requests a different signing algorithm.
   */
  async function verifyToken(
    token: string,
    expectedTokenType: AuthenticationTokenType,
    key: Uint8Array,
  ): Promise<AuthenticationTokenClaims> {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    });

    /**
     * A cryptographically valid JWT is not automatically a valid MailShrimp
     * authentication token. Required application claims must also have the
     * expected type and value.
     */
    if (
      typeof payload.sub !== "string" ||
      payload.sub.length === 0 ||
      payload.tokenType !== expectedTokenType
    ) {
      throw new Error("Invalid authentication token claims.");
    }

    return {
      sub: payload.sub,
      tokenType: expectedTokenType,
    };
  }

  return {
    createAccessToken(accountId: string): Promise<string> {
      return createToken(
        accountId,
        "access",
        accessTokenKey,
        lifetimes.accessTokenTtlSeconds,
      );
    },

    createRefreshToken(accountId: string): Promise<string> {
      return createToken(
        accountId,
        "refresh",
        refreshTokenKey,
        lifetimes.refreshTokenTtlSeconds,
      );
    },

    verifyAccessToken(token: string): Promise<AuthenticationTokenClaims> {
      return verifyToken(token, "access", accessTokenKey);
    },

    verifyRefreshToken(token: string): Promise<AuthenticationTokenClaims> {
      return verifyToken(token, "refresh", refreshTokenKey);
    },
  };
}