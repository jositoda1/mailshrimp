// services/accounts-service/__tests__/token-service.test.ts

import { SignJWT, decodeJwt } from "jose";

import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from "../src/auth/token-config.js";
import { createTokenService } from "../src/auth/token-service.js";

/**
 * These values are test-only signing secrets.
 *
 * I deliberately keep deterministic test credentials in the test suite rather
 * than reading the developer's .env file. Tests must behave the same way on a
 * developer machine and in CI, and must never depend on real credentials.
 */
const ACCESS_TOKEN_SECRET =
  "test-access-token-secret-that-is-long-enough-for-tests";
const REFRESH_TOKEN_SECRET =
  "test-refresh-token-secret-that-is-long-enough-for-tests";

const ACCOUNT_ID = "account-123";

/**
 * Creates a fresh token service for each test.
 *
 * Keeping construction explicit makes it clear which credentials are trusted
 * by the verifier and avoids sharing mutable authentication state between
 * tests.
 */
function createTestTokenService(): ReturnType<typeof createTokenService> {
  return createTokenService({
    accessTokenSecret: ACCESS_TOKEN_SECRET,
    refreshTokenSecret: REFRESH_TOKEN_SECRET,
  });
}

describe("authentication token service", () => {
  it("creates and verifies an access token", async () => {
    const tokenService = createTestTokenService();

    const token = await tokenService.createAccessToken(ACCOUNT_ID);
    const claims = await tokenService.verifyAccessToken(token);

    expect(claims).toEqual({
      sub: ACCOUNT_ID,
      tokenType: "access",
    });
  });

  it("creates and verifies a refresh token", async () => {
    const tokenService = createTestTokenService();

    const token = await tokenService.createRefreshToken(ACCOUNT_ID);
    const claims = await tokenService.verifyRefreshToken(token);

    expect(claims).toEqual({
      sub: ACCOUNT_ID,
      tokenType: "refresh",
    });
  });

  it("signs access tokens with the expected lifetime", async () => {
    const tokenService = createTestTokenService();
    const token = await tokenService.createAccessToken(ACCOUNT_ID);

    /**
     * decodeJwt() does not verify the signature, so I use it here only after
     * the service has independently demonstrated that it can verify the token.
     * This assertion inspects timing claims; it is not an authorization check.
     */
    await expect(tokenService.verifyAccessToken(token)).resolves.toBeDefined();

    const payload = decodeJwt(token);

    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");

    expect(payload.exp! - payload.iat!).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });

  it("signs refresh tokens with the expected lifetime", async () => {
    const tokenService = createTestTokenService();
    const token = await tokenService.createRefreshToken(ACCOUNT_ID);

    await expect(tokenService.verifyRefreshToken(token)).resolves.toBeDefined();

    const payload = decodeJwt(token);

    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");

    expect(payload.exp! - payload.iat!).toBe(REFRESH_TOKEN_TTL_SECONDS);
  });

  it("does not accept an access token as a refresh token", async () => {
    const tokenService = createTestTokenService();
    const token = await tokenService.createAccessToken(ACCOUNT_ID);

    /**
     * Access and refresh tokens have separate signing credentials as well as a
     * signed tokenType claim. Both controls prevent one token class from being
     * substituted for the other.
     */
    await expect(tokenService.verifyRefreshToken(token)).rejects.toThrow();
  });

  it("does not accept a refresh token as an access token", async () => {
    const tokenService = createTestTokenService();
    const token = await tokenService.createRefreshToken(ACCOUNT_ID);

    await expect(tokenService.verifyAccessToken(token)).rejects.toThrow();
  });

  it("rejects a token signed with an untrusted key", async () => {
    const tokenService = createTestTokenService();

    const untrustedKey = new TextEncoder().encode(
      "untrusted-test-signing-secret-that-is-long-enough",
    );

    const token = await new SignJWT({ tokenType: "access" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(ACCOUNT_ID)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(untrustedKey);

    await expect(tokenService.verifyAccessToken(token)).rejects.toThrow();
  });

  it("rejects a token whose signed payload has been tampered with", async () => {
    const tokenService = createTestTokenService();
    const token = await tokenService.createAccessToken(ACCOUNT_ID);

    const [header, , signature] = token.split(".");

    /**
     * A JWT consists of header.payload.signature. Replacing the signed payload
     * without recomputing the signature simulates modification after issuance.
     */
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        sub: "attacker-controlled-account",
        tokenType: "access",
      }),
    ).toString("base64url");

    const tamperedToken = `${header}.${tamperedPayload}.${signature}`;

    await expect(
      tokenService.verifyAccessToken(tamperedToken),
    ).rejects.toThrow();
  });

  it("rejects a validly signed token with the wrong application token type", async () => {
    const tokenService = createTestTokenService();
    const accessKey = new TextEncoder().encode(ACCESS_TOKEN_SECRET);

    /**
     * This token has a valid signature using the trusted access-token key, but
     * its application claim says it is a refresh token. Cryptographic validity
     * alone must therefore not be sufficient for authentication.
     */
    const token = await new SignJWT({ tokenType: "refresh" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(ACCOUNT_ID)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(accessKey);

    await expect(tokenService.verifyAccessToken(token)).rejects.toThrow(
      "Invalid authentication token claims.",
    );
  });

  it("rejects a validly signed token without an account subject", async () => {
    const tokenService = createTestTokenService();
    const accessKey = new TextEncoder().encode(ACCESS_TOKEN_SECRET);

    const token = await new SignJWT({ tokenType: "access" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(accessKey);

    await expect(tokenService.verifyAccessToken(token)).rejects.toThrow(
      "Invalid authentication token claims.",
    );
  });

    it("rejects an expired access token", async () => {
    const tokenService = createTestTokenService();
    const accessKey = new TextEncoder().encode(ACCESS_TOKEN_SECRET);

    /**
     * I create an already-expired token with the trusted signing key so this
     * test isolates expiration validation from signature validation.
     *
     * A token with a valid signature must still be rejected after its
     * expiration time has passed.
     */
    const token = await new SignJWT({ tokenType: "access" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(ACCOUNT_ID)
      .setIssuedAt()
      .setExpirationTime("0s")
      .sign(accessKey);

    await expect(tokenService.verifyAccessToken(token)).rejects.toThrow();
  });
});