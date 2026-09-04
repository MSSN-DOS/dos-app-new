import { describe, expect, it } from "vitest";

import { paginate, parsePagination } from "./pagination";

function makeRows(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}

describe("parsePagination", () => {
  it("returns empty params when neither page nor pageSize is present", () => {
    const result = parsePagination(new URLSearchParams());
    expect(result).toEqual({ ok: true, params: {} });
  });

  it("parses valid page and pageSize", () => {
    const result = parsePagination(new URLSearchParams("page=2&pageSize=10"));
    expect(result).toEqual({ ok: true, params: { page: 2, pageSize: 10 } });
  });

  it("coerces numeric strings", () => {
    const result = parsePagination(new URLSearchParams("page=3"));
    expect(result).toEqual({ ok: true, params: { page: 3 } });
  });

  it("rejects zero or negative page", () => {
    const result = parsePagination(new URLSearchParams("page=0"));
    expect(result.ok).toBe(false);
  });

  it("rejects pageSize above 100", () => {
    const result = parsePagination(new URLSearchParams("pageSize=101"));
    expect(result.ok).toBe(false);
  });

  it("rejects non-numeric values", () => {
    const result = parsePagination(new URLSearchParams("page=abc"));
    expect(result.ok).toBe(false);
  });
});

describe("paginate", () => {
  it("returns all rows with total meta when no params given", () => {
    const rows = makeRows(5);
    const { data, meta } = paginate(rows, {});
    expect(data).toHaveLength(5);
    expect(meta).toEqual({ page: 1, pageSize: 5, total: 5, totalPages: 1 });
  });

  it("slices the requested page", () => {
    const rows = makeRows(25);
    const { data, meta } = paginate(rows, { page: 2, pageSize: 10 });
    expect(data).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(meta).toEqual({ page: 2, pageSize: 10, total: 25, totalPages: 3 });
  });

  it("clamps page beyond the last page to the last page", () => {
    const rows = makeRows(12);
    const { data, meta } = paginate(rows, { page: 99, pageSize: 10 });
    expect(data).toEqual([11, 12]);
    expect(meta.page).toBe(2);
    expect(meta.totalPages).toBe(2);
  });

  it("defaults pageSize to 20 when only page is given", () => {
    const rows = makeRows(45);
    const { data, meta } = paginate(rows, { page: 2 });
    expect(data).toEqual(makeRows(45).slice(20, 40));
    expect(meta).toEqual({ page: 2, pageSize: 20, total: 45, totalPages: 3 });
  });

  it("returns empty data with one page for an empty list", () => {
    const { data, meta } = paginate<number>([], { page: 1, pageSize: 10 });
    expect(data).toEqual([]);
    expect(meta).toEqual({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  });
});
