import { z } from "zod";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export type PaginationParseResult =
  | { ok: true; params: PaginationParams }
  | { ok: false; issues: z.ZodIssue[] };

/** Parses optional `page`/`pageSize` query params. Absent on both = unpaginated. */
export function parsePagination(searchParams: URLSearchParams): PaginationParseResult {
  const raw: Record<string, string> = {};
  const page = searchParams.get("page");
  const pageSize = searchParams.get("pageSize");
  if (page !== null) raw.page = page;
  if (pageSize !== null) raw.pageSize = pageSize;
  if (Object.keys(raw).length === 0) return { ok: true, params: {} };

  const parsed = paginationSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues };
  return { ok: true, params: parsed.data };
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Slices rows for the requested page; without params returns everything. */
export function paginate<T>(rows: T[], params: PaginationParams): { data: T[]; meta: PageMeta } {
  const total = rows.length;
  if (params.page === undefined && params.pageSize === undefined) {
    return {
      data: rows,
      meta: { page: 1, pageSize: total, total, totalPages: 1 },
    };
  }

  const size = params.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(params.page ?? 1, totalPages);
  return {
    data: rows.slice((page - 1) * size, page * size),
    meta: { page, pageSize: size, total, totalPages },
  };
}
