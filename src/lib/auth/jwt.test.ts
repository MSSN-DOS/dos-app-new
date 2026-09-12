// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { signSession, verifySession, type SessionPayload } from "./jwt";

const TEST_SECRET = "test-secret-at-least-32-characters-long-123456";

describe("jwt", () => {
  const original = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original;
  });

  const payload: SessionPayload = { userId: 7, roleId: 3 };

  it("round-trips a signed session", async () => {
    const token = await signSession(payload);
    const verified = await verifySession(token);
    expect(verified).toEqual(payload);
  });

  it("produces a 7d-expiring token by default", async () => {
    const token = await signSession(payload);
    const { payload: decoded } = await import("jose").then(({ jwtVerify }) =>
      jwtVerify(token, new TextEncoder().encode(TEST_SECRET)),
    );
    expect(typeof decoded.exp).toBe("number");
    expect(decoded.exp! - decoded.iat!).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 - 5);
  });

  it("rejects a tampered token", async () => {
    const token = await signSession(payload);
    await expect(verifySession(`${token}tampered`)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await signSession(payload, "1s");
    await new Promise((r) => setTimeout(r, 1100));
    await expect(verifySession(token)).rejects.toThrow();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession(payload);
    process.env.JWT_SECRET = "a-different-secret-that-is-also-long-enough-123456";
    await expect(verifySession(token)).rejects.toThrow();
  });
});
