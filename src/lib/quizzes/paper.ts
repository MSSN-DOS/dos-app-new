export interface PaperBlock {
  height: number;
  newPage?: boolean;
}
/** Keep each question together; an oversized block occupies one scaled page. */
export function paginatePaperBlocks(
  blocks: readonly PaperBlock[],
  capacity = 990,
): number[][] {
  if (!Number.isFinite(capacity) || capacity <= 0)
    throw new Error("Paper capacity must be positive");
  const pages: number[][] = [];
  let page: number[] = [];
  let used = 0;
  blocks.forEach((block, index) => {
    if (!Number.isFinite(block.height))
      throw new Error("Paper block height must be finite");
    const height = Math.max(0, block.height);
    if (page.length && (block.newPage || used + height > capacity)) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(index);
    used += height;
  });
  if (page.length) pages.push(page);
  return pages;
}
export function paperFilename(title: string): string {
  return `${
    title
      .replace(/[^\p{L}\p{N}\- ]/gu, "")
      .trim()
      .slice(0, 120) || "quiz"
  }.pdf`;
}
