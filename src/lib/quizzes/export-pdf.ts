import { paperFilename } from "./paper";

/** Render unscaled A4 pages; no iframe or external script/download capability needed. */
export async function exportQuizPdf(
  pages: readonly HTMLElement[],
  title: string,
): Promise<void> {
  if (!pages.length) throw new Error("Wait for the paper pages to finish preparing.");
  await document.fonts.ready;
  await Promise.all(
    pages
      .flatMap((page) => Array.from(page.querySelectorAll("img")))
      .map((image) => image.decode().catch(() => undefined)),
  );
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  for (const [index, page] of pages.entries()) {
    if (index > 0) pdf.addPage();
    const canvas = await html2canvas(page, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: null,
    });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
  }
  pdf.save(paperFilename(title));
}
