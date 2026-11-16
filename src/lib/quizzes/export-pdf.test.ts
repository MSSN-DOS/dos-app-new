import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportQuizPdf } from "./export-pdf";
const { canvas, addPage, addImage, save } = vi.hoisted(() => ({
  canvas: vi.fn(),
  addPage: vi.fn(),
  addImage: vi.fn(),
  save: vi.fn(),
}));
vi.mock("html2canvas", () => ({ default: canvas }));
vi.mock("jspdf", () => ({
  jsPDF: class {
    addPage = addPage;
    addImage = addImage;
    save = save;
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
  canvas.mockResolvedValue({ toDataURL: () => "data:image/jpeg;base64,test" });
});
describe("PDF download", () => {
  it("exports exactly one A4 image per measured page and downloads without Print", async () => {
    await exportQuizPdf(
      [
        document.createElement("article"),
        document.createElement("article"),
        document.createElement("article"),
      ],
      "Mechanics",
    );
    expect(canvas).toHaveBeenCalledTimes(3);
    expect(addPage).toHaveBeenCalledTimes(2);
    expect(addImage).toHaveBeenCalledWith(
      "data:image/jpeg;base64,test",
      "JPEG",
      0,
      0,
      210,
      297,
    );
    expect(save).toHaveBeenCalledWith("Mechanics.pdf");
  });
  it("rejects premature exports and propagates rendering failures for the UI", async () => {
    await expect(exportQuizPdf([], "Test")).rejects.toThrow(/preparing/);
    canvas.mockRejectedValueOnce(new Error("Image rendering failed"));
    await expect(
      exportQuizPdf([document.createElement("article")], "Test"),
    ).rejects.toThrow("Image rendering failed");
    expect(save).not.toHaveBeenCalled();
  });
});
