import { describe, expect, it, vi } from "vitest";
import { resolveSemesterForDate, SESSION_CALENDAR } from "./calendar";
import { getActiveSemester } from "./index";

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

describe("resolveSemesterForDate", () => {
  it("resolves Harmattan during its lecture + exam span", () => {
    expect(resolveSemesterForDate(utcDate("2025-10-20"))).toBe("harmattan");
    expect(resolveSemesterForDate(utcDate("2025-12-25"))).toBe("harmattan");
    expect(resolveSemesterForDate(utcDate("2026-02-06"))).toBe("harmattan");
  });

  it("falls back to Harmattan in the gap before Rain starts", () => {
    expect(resolveSemesterForDate(utcDate("2026-02-07"))).toBe("harmattan");
    expect(resolveSemesterForDate(utcDate("2026-02-22"))).toBe("harmattan");
  });

  it("resolves Rain during its lecture + exam span", () => {
    expect(resolveSemesterForDate(utcDate("2026-02-23"))).toBe("rain");
    expect(resolveSemesterForDate(utcDate("2026-05-01"))).toBe("rain");
    expect(resolveSemesterForDate(utcDate("2026-07-03"))).toBe("rain");
  });

  it("falls back to Rain after the session ends", () => {
    expect(resolveSemesterForDate(utcDate("2026-07-04"))).toBe("rain");
    expect(resolveSemesterForDate(utcDate("2026-09-30"))).toBe("rain");
  });

  it("defaults to Harmattan before the session calendar begins", () => {
    expect(resolveSemesterForDate(utcDate("2025-08-01"))).toBe("harmattan");
    expect(resolveSemesterForDate(utcDate("2025-10-19"))).toBe("harmattan");
  });
});

describe("getActiveSemester", () => {
  it("returns the manual override when mode is manual", async () => {
    const db = { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() } as unknown as Parameters<typeof getActiveSemester>[0];
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({
        orderBy: () => ({
          limit: async () => [{ mode: "manual", manualOverride: "rain" }],
        }),
      }),
    });
    await expect(getActiveSemester(db)).resolves.toBe("rain");
  });

  it("ignores a stale override when mode is auto", async () => {
    const db = { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() } as unknown as Parameters<typeof getActiveSemester>[0];
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({
        orderBy: () => ({
          limit: async () => [{ mode: "auto", manualOverride: "rain" }],
        }),
      }),
    });
    const expected = resolveSemesterForDate(new Date());
    await expect(getActiveSemester(db)).resolves.toBe(expected);
  });

  it("falls back to the date resolver when no settings row exists", async () => {
    const db = { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() } as unknown as Parameters<typeof getActiveSemester>[0];
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({
        orderBy: () => ({
          limit: async () => [],
        }),
      }),
    });
    const expected = resolveSemesterForDate(new Date());
    await expect(getActiveSemester(db)).resolves.toBe(expected);
  });

  it("exposes the session calendar boundaries for maintainers", () => {
    expect(SESSION_CALENDAR.rainEnd).toBe("2026-07-03");
  });
});
