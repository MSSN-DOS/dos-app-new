import { describe, expect, it } from "vitest";

import { generateInitialPassword, INITIAL_PASSWORD_ALPHABET } from "./password";

describe("generateInitialPassword", () => {
  it("defaults to 12 characters", () => {
    expect(generateInitialPassword()).toHaveLength(12);
  });

  it("honours an explicit length", () => {
    expect(generateInitialPassword(20)).toHaveLength(20);
    expect(generateInitialPassword(1)).toHaveLength(1);
  });

  it("clears the 8-character minimum the login schema enforces", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateInitialPassword().length).toBeGreaterThanOrEqual(8);
    }
  });

  it("never emits a glyph that is misread off a screen", () => {
    // This password gets read aloud, screenshotted and typed on a phone. 0/O, 1/l/I are the
    // characters that turn a first sign-in into a support ticket.
    const ambiguous = /[0OoIl1]/;
    for (let i = 0; i < 200; i += 1) {
      expect(ambiguous.test(generateInitialPassword())).toBe(false);
    }
  });

  it("only uses the documented alphabet", () => {
    for (let i = 0; i < 50; i += 1) {
      for (const character of generateInitialPassword()) {
        expect(INITIAL_PASSWORD_ALPHABET).toContain(character);
      }
    }
  });

  it("does not repeat itself", () => {
    const generated = new Set(Array.from({ length: 200 }, () => generateInitialPassword()));
    expect(generated.size).toBe(200);
  });

  it("rejects a nonsensical length rather than returning something unusable", () => {
    expect(() => generateInitialPassword(0)).toThrow();
    expect(() => generateInitialPassword(-3)).toThrow();
    expect(() => generateInitialPassword(2.5)).toThrow();
  });
});

describe("INITIAL_PASSWORD_ALPHABET", () => {
  it("is large enough for 12 characters to be strong", () => {
    // 56^12 is ~70 bits; anything under ~50 symbols would be worth revisiting.
    expect(INITIAL_PASSWORD_ALPHABET.length).toBeGreaterThanOrEqual(50);
  });

  it("has no duplicates", () => {
    expect(new Set(INITIAL_PASSWORD_ALPHABET).size).toBe(INITIAL_PASSWORD_ALPHABET.length);
  });
});
