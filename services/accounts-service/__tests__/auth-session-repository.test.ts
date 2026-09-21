// services/accounts-service/__tests__/auth-session-repository.test.ts

import type { AuthSession } from "../src/auth/session/auth-session.js";
import { InMemoryAuthSessionRepository } from "../src/auth/session/in-memory-auth-session-repository.js";

/**
 * Creates a valid refresh session for repository tests.
 *
 * I keep test construction in one helper so each test can override only the
 * fields relevant to the behavior being verified. The defaults deliberately
 * contain no real tokens, credentials, secrets, or personal information.
 */
function createSession(
  overrides: Partial<AuthSession> = {},
): AuthSession {
  return {
    id: "session-a",
    accountId: 10,
    tokenId: "token-a",
    tokenHash: "test-token-hash-a",
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    revokedAt: null,
    replacedByTokenId: null,
    createdAt: new Date("2026-09-22T00:00:00.000Z"),
    updatedAt: new Date("2026-09-22T00:00:00.000Z"),
    ...overrides,
  };
}

describe("InMemoryAuthSessionRepository", () => {
  /**
   * Every test receives a fresh repository.
   *
   * Authentication tests must not leak session state into another test,
   * because that could hide ordering bugs or make security tests dependent
   * on execution order.
   */
  let repository: InMemoryAuthSessionRepository;

  beforeEach(() => {
    repository = new InMemoryAuthSessionRepository();
  });

  it("creates and retrieves a refresh session", async () => {
    const session = createSession();

    await repository.create(session);

    await expect(repository.findByTokenId(session.tokenId)).resolves.toEqual(
      session,
    );
  });

  it("returns null for an unknown token identifier", async () => {
    await expect(
      repository.findByTokenId("unknown-token"),
    ).resolves.toBeNull();
  });

  it("does not expose mutable persisted session state", async () => {
    const session = createSession();

    await repository.create(session);

    const retrieved = await repository.findByTokenId(session.tokenId);

    expect(retrieved).not.toBeNull();

    retrieved!.accountId = 999;
    retrieved!.expiresAt.setUTCFullYear(2040);

    const persisted = await repository.findByTokenId(session.tokenId);

    expect(persisted?.accountId).toBe(10);
    expect(persisted?.expiresAt).toEqual(
      new Date("2030-01-01T00:00:00.000Z"),
    );
  });

  it("rejects duplicate token identifiers", async () => {
    const session = createSession();

    await repository.create(session);

    await expect(
      repository.create(
        createSession({
          id: "session-duplicate",
        }),
      ),
    ).rejects.toThrow("Auth session token ID already exists");
  });

  it("atomically rotates an active refresh session", async () => {
    const current = createSession();

    const replacement = createSession({
      id: "session-b",
      tokenId: "token-b",
      tokenHash: "test-token-hash-b",
      createdAt: new Date("2026-09-22T00:05:00.000Z"),
      updatedAt: new Date("2026-09-22T00:05:00.000Z"),
    });

    const rotatedAt = new Date("2026-09-22T00:05:00.000Z");

    await repository.create(current);

    await expect(
      repository.rotate(current.tokenId, replacement, rotatedAt),
    ).resolves.toEqual({
      status: "rotated",
    });

    const consumed = await repository.findByTokenId(current.tokenId);
    const persistedReplacement = await repository.findByTokenId(
      replacement.tokenId,
    );

    expect(consumed?.revokedAt).toEqual(rotatedAt);
    expect(consumed?.replacedByTokenId).toBe(replacement.tokenId);
    expect(consumed?.updatedAt).toEqual(rotatedAt);

    expect(persistedReplacement).toEqual(replacement);
  });

  it("reports a previously consumed refresh session as already revoked", async () => {
    const current = createSession();

    const replacement = createSession({
      id: "session-b",
      tokenId: "token-b",
      tokenHash: "test-token-hash-b",
    });

    const rotatedAt = new Date("2026-09-22T00:05:00.000Z");

    await repository.create(current);

    await repository.rotate(
      current.tokenId,
      replacement,
      rotatedAt,
    );

    const secondReplacement = createSession({
      id: "session-c",
      tokenId: "token-c",
      tokenHash: "test-token-hash-c",
    });

    const result = await repository.rotate(
      current.tokenId,
      secondReplacement,
      new Date("2026-09-22T00:06:00.000Z"),
    );

    expect(result.status).toBe("already_revoked");

    if (result.status === "already_revoked") {
      expect(result.session.tokenId).toBe(current.tokenId);
      expect(result.session.replacedByTokenId).toBe(
        replacement.tokenId,
      );
    }

    await expect(
      repository.findByTokenId(secondReplacement.tokenId),
    ).resolves.toBeNull();
  });

  it("does not rotate an expired refresh session", async () => {
    const expired = createSession({
      expiresAt: new Date("2026-09-22T00:04:00.000Z"),
    });

    const replacement = createSession({
      id: "session-b",
      tokenId: "token-b",
      tokenHash: "test-token-hash-b",
    });

    await repository.create(expired);

    const result = await repository.rotate(
      expired.tokenId,
      replacement,
      new Date("2026-09-22T00:05:00.000Z"),
    );

    expect(result.status).toBe("expired");

    await expect(
      repository.findByTokenId(replacement.tokenId),
    ).resolves.toBeNull();
  });

  it("reports an unknown refresh session during rotation", async () => {
    const replacement = createSession({
      id: "session-b",
      tokenId: "token-b",
      tokenHash: "test-token-hash-b",
    });

    await expect(
      repository.rotate(
        "unknown-token",
        replacement,
        new Date("2026-09-22T00:05:00.000Z"),
      ),
    ).resolves.toEqual({
      status: "not_found",
    });
  });

  it("prevents refresh rotation from crossing account boundaries", async () => {
    const current = createSession({
      accountId: 10,
    });

    const maliciousReplacement = createSession({
      id: "session-b",
      accountId: 999,
      tokenId: "token-b",
      tokenHash: "test-token-hash-b",
    });

    await repository.create(current);

    await expect(
      repository.rotate(
        current.tokenId,
        maliciousReplacement,
        new Date("2026-09-22T00:05:00.000Z"),
      ),
    ).rejects.toThrow(
      "A refresh-session replacement must belong to the same account.",
    );

    const persistedCurrent = await repository.findByTokenId(
      current.tokenId,
    );

    expect(persistedCurrent?.revokedAt).toBeNull();

    await expect(
      repository.findByTokenId(maliciousReplacement.tokenId),
    ).resolves.toBeNull();
  });

  it("allows only one concurrent rotation of the same refresh session", async () => {
    const current = createSession();

    const replacementB = createSession({
      id: "session-b",
      tokenId: "token-b",
      tokenHash: "test-token-hash-b",
    });

    const replacementC = createSession({
      id: "session-c",
      tokenId: "token-c",
      tokenHash: "test-token-hash-c",
    });

    const rotatedAt = new Date("2026-09-22T00:05:00.000Z");

    await repository.create(current);

    /**
     * Both rotations start without awaiting the other one.
     *
     * Exactly one operation must consume the current session. If both return
     * "rotated", the repository would permit refresh-token replay under
     * concurrency.
     */
    const results = await Promise.all([
      repository.rotate(
        current.tokenId,
        replacementB,
        rotatedAt,
      ),
      repository.rotate(
        current.tokenId,
        replacementC,
        rotatedAt,
      ),
    ]);

    expect(
      results.filter((result) => result.status === "rotated"),
    ).toHaveLength(1);

    expect(
      results.filter(
        (result) => result.status === "already_revoked",
      ),
    ).toHaveLength(1);

    const storedB = await repository.findByTokenId(
      replacementB.tokenId,
    );

    const storedC = await repository.findByTokenId(
      replacementC.tokenId,
    );

    /**
     * Only the winning replacement may exist.
     *
     * This assertion prevents a weaker implementation from returning the
     * expected statuses while still accidentally persisting both children.
     */
    expect(
      [storedB, storedC].filter(
        (session): session is AuthSession => session !== null,
      ),
    ).toHaveLength(1);
  });

  it("revokes a specific session without deleting it", async () => {
    const session = createSession();
    const revokedAt = new Date("2026-09-22T00:10:00.000Z");

    await repository.create(session);
    await repository.revokeByTokenId(
      session.tokenId,
      revokedAt,
    );

    const persisted = await repository.findByTokenId(
      session.tokenId,
    );

    expect(persisted).not.toBeNull();
    expect(persisted?.revokedAt).toEqual(revokedAt);
    expect(persisted?.replacedByTokenId).toBeNull();
  });

  it("keeps specific-session revocation idempotent", async () => {
    const session = createSession();

    const firstRevocation = new Date(
      "2026-09-22T00:10:00.000Z",
    );

    const secondRevocation = new Date(
      "2026-09-22T00:20:00.000Z",
    );

    await repository.create(session);

    await repository.revokeByTokenId(
      session.tokenId,
      firstRevocation,
    );

    await repository.revokeByTokenId(
      session.tokenId,
      secondRevocation,
    );

    const persisted = await repository.findByTokenId(
      session.tokenId,
    );

    expect(persisted?.revokedAt).toEqual(firstRevocation);
    expect(persisted?.updatedAt).toEqual(firstRevocation);
  });

  it("revokes only sessions belonging to the requested account", async () => {
    const accountTenSessionA = createSession({
      id: "session-10-a",
      accountId: 10,
      tokenId: "token-10-a",
    });

    const accountTenSessionB = createSession({
      id: "session-10-b",
      accountId: 10,
      tokenId: "token-10-b",
    });

    const accountTwentySession = createSession({
      id: "session-20-a",
      accountId: 20,
      tokenId: "token-20-a",
    });

    const revokedAt = new Date("2026-09-22T00:15:00.000Z");

    await repository.create(accountTenSessionA);
    await repository.create(accountTenSessionB);
    await repository.create(accountTwentySession);

    await repository.revokeAllForAccount(10, revokedAt);

    const persistedTenA = await repository.findByTokenId(
      accountTenSessionA.tokenId,
    );

    const persistedTenB = await repository.findByTokenId(
      accountTenSessionB.tokenId,
    );

    const persistedTwenty = await repository.findByTokenId(
      accountTwentySession.tokenId,
    );

    expect(persistedTenA?.revokedAt).toEqual(revokedAt);
    expect(persistedTenB?.revokedAt).toEqual(revokedAt);

    expect(persistedTwenty?.revokedAt).toBeNull();
  });
});