import { describe, expect, it } from "vitest";
import { paginatePaperBlocks, paperFilename } from "./paper";
describe("A4 pagination", () => {
  it("never splits questions, accepts exact fits and numbers every block once", () => {
    expect(
      paginatePaperBlocks([
        { height: 190 },
        { height: 400 },
        { height: 400 },
        { height: 100 },
      ]),
    ).toEqual([[0, 1, 2], [3]]);
  });
  it("starts the marking scheme on a new page and isolates oversized questions", () => {
    expect(
      paginatePaperBlocks([
        { height: 120 },
        { height: 1400 },
        { height: 20 },
        { height: 50, newPage: true },
        { height: 70 },
      ]),
    ).toEqual([[0], [1], [2], [3, 4]]);
  });
  it("handles empty papers and rejects invalid measurements", () => {
    expect(paginatePaperBlocks([])).toEqual([]);
    expect(() => paginatePaperBlocks([], 0)).toThrow();
    expect(() => paginatePaperBlocks([{ height: NaN }])).toThrow();
  });
  it("makes safe, bounded filenames", () => {
    expect(paperFilename('../Mechanics: "quiz"')).toBe("Mechanics quiz.pdf");
    expect(paperFilename("///")).toBe("quiz.pdf");
  });
});
