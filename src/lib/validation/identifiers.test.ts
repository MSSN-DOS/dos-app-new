import { describe, expect, it } from "vitest";

import {
  identifierTypeFor,
  jambRegNumberSchema,
  matricNumberSchema,
  staffIdSchema,
} from "./identifiers";

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
    expect(matricNumberSchema.safeParse("12345678AB").success).toBe(false);
  });
});

describe("jambRegNumberSchema", () => {
  it("accepts the 10-char standard shape", () => {
    expect(jambRegNumberSchema.safeParse("12345678AB").success).toBe(true);
  });

  it("accepts the 14-char expanded shape", () => {
    expect(jambRegNumberSchema.safeParse("202612345678AB").success).toBe(true);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(jambRegNumberSchema.safeParse("  12345678AB  ").success).toBe(true);
  });

  it("rejects lowercase trailing letters", () => {
    expect(jambRegNumberSchema.safeParse("12345678ab").success).toBe(false);
  });

  it("rejects a 9-digit value", () => {
    expect(jambRegNumberSchema.safeParse("123456789AB").success).toBe(false);
  });

  it("rejects a matric-shaped value", () => {
    expect(jambRegNumberSchema.safeParse("21/30GN019").success).toBe(false);
  });
});

describe("identifierTypeFor", () => {
  it("returns matric_number for a matric value", () => {
    expect(identifierTypeFor("21/30GN019")).toBe("matric_number");
  });

  it("returns jamb_reg_number for a standard JAMB value", () => {
    expect(identifierTypeFor("12345678AB")).toBe("jamb_reg_number");
  });

  it("returns jamb_reg_number for an expanded JAMB value", () => {
    expect(identifierTypeFor("202612345678AB")).toBe("jamb_reg_number");
  });

  it("returns null for a value matching neither format", () => {
    expect(identifierTypeFor("not-an-id")).toBeNull();
  });

  it("returns null for a staff ID — staff identifiers are never user-supplied", () => {
    // A staff ID is a well-formed identifier, but not one a registration body can carry, so
    // discriminating it here would invite a caller to accept it at a boundary that never
    // legitimately sees one.
    expect(identifierTypeFor("STF-001")).toBeNull();
  });
});

describe("staffIdSchema", () => {
  it("accepts the generated three-digit shape", () => {
    expect(staffIdSchema.safeParse("STF-001").success).toBe(true);
    expect(staffIdSchema.safeParse("STF-999").success).toBe(true);
  });

  it("accepts values past the padding width, so it cannot reject a generated ID", () => {
    expect(staffIdSchema.safeParse("STF-1000").success).toBe(true);
  });

  it("trims surrounding whitespace before matching", () => {
    expect(staffIdSchema.safeParse("  STF-001  ").success).toBe(true);
  });

  it("rejects a legacy hand-typed identifier", () => {
    expect(staffIdSchema.safeParse("ADM/2026/001").success).toBe(false);
    expect(staffIdSchema.safeParse("staff-1").success).toBe(false);
  });

  it("rejects shapes that are almost right", () => {
    expect(staffIdSchema.safeParse("STF-").success).toBe(false);
    expect(staffIdSchema.safeParse("STF-ABC").success).toBe(false);
    expect(staffIdSchema.safeParse("STF 001").success).toBe(false);
    expect(staffIdSchema.safeParse("STF-001-A").success).toBe(false);
  });
});
