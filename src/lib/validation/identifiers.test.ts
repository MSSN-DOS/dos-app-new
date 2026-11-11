import { describe, expect, it } from "vitest";

import { identifierTypeFor, jambRegNumberSchema, matricNumberSchema } from "./identifiers";

describe("matricNumberSchema", () => {
  it("accepts a valid matric number", () => {
    expect(matricNumberSchema.safeParse("21/30GN019").success).toBe(true);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(matricNumberSchema.safeParse("  21/30GN019  ").success).toBe(true);
  });

  it("rejects wrong year width", () => {
    expect(matricNumberSchema.safeParse("211/30GN019").success).toBe(false);
  });

  it("rejects lowercase department letters", () => {
    expect(matricNumberSchema.safeParse("21/30gn019").success).toBe(false);
  });

  it("rejects wrong serial width", () => {
    expect(matricNumberSchema.safeParse("21/30GN19").success).toBe(false);
  });

  it("rejects a JAMB-shaped value", () => {
    expect(matricNumberSchema.safeParse("202612345678AB").success).toBe(false);
  });
});

describe("jambRegNumberSchema", () => {
  it("accepts the 12-digit-year + 8-digit + 2-letter shape", () => {
    expect(jambRegNumberSchema.safeParse("202612345678AB").success).toBe(true);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(jambRegNumberSchema.safeParse("  202612345678AB  ").success).toBe(true);
  });

  it("rejects the legacy 10-char 8+2 shape", () => {
    expect(jambRegNumberSchema.safeParse("12345678AB").success).toBe(false);
  });

  it("rejects lowercase trailing letters", () => {
    expect(jambRegNumberSchema.safeParse("202612345678ab").success).toBe(false);
  });

  it("rejects a 13-digit value", () => {
    expect(jambRegNumberSchema.safeParse("2026123456789AB").success).toBe(false);
  });

  it("rejects a one-letter suffix", () => {
    expect(jambRegNumberSchema.safeParse("202612345678A").success).toBe(false);
  });

  it("rejects a matric-shaped value", () => {
    expect(jambRegNumberSchema.safeParse("21/30GN019").success).toBe(false);
  });
});

describe("identifierTypeFor", () => {
  it("returns matric_number for a matric value", () => {
    expect(identifierTypeFor("21/30GN019")).toBe("matric_number");
  });

  it("returns jamb_reg_number for a JAMB value", () => {
    expect(identifierTypeFor("202612345678AB")).toBe("jamb_reg_number");
  });

  it("returns null for the legacy 8+2 JAMB shape", () => {
    expect(identifierTypeFor("12345678AB")).toBeNull();
  });

  it("returns null for a value matching neither format", () => {
    expect(identifierTypeFor("not-an-id")).toBeNull();
  });
});
