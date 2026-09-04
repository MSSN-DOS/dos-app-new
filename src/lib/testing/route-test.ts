import { vi, type Mock } from "vitest";

// Shared fakes for API route-handler tests. Route handlers only use a narrow slice of the
// Drizzle query builder, so these chainable stubs cover exactly that slice and let each test
// script the returned rows. The DB layer itself is mocked at the "@/lib/db" boundary.
export interface DbMock {
  select: Mock;
  insert: Mock;
  update: Mock;
  delete: Mock;
  transaction: Mock;
}

export type Row = Record<string, unknown>;

interface SelectChain {
  orderBy: () => Promise<Row[]> & { limit: () => Promise<Row[]> };
  where: () => { limit: () => Promise<Row[]>; orderBy: () => Promise<Row[]> & { limit: () => Promise<Row[]> } };
  innerJoin: () => SelectChain;
  leftJoin: () => SelectChain;
}

export function makeDbMock(): DbMock {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  };
}

/** select().from(t).orderBy(...) or select(...).from(t).where(...).limit(1) */
export function stubSelect(db: DbMock, results: Row[][]): void {
  let call = 0;
  db.select.mockImplementation(() => {
    const result = results[Math.min(call, results.length - 1)] ?? [];
    call += 1;
    // Recursive so join chains (.innerJoin/.leftJoin) keep the same terminal methods.
    // orderBy() must resolve to the rows itself while still exposing .limit(1) afterwards.
    const limit = async (): Promise<Row[]> => result.slice(0, 1);
    const orderedRows = (): Promise<Row[]> & { limit: () => Promise<Row[]> } => {
      const promise = Promise.resolve(result) as Promise<Row[]> & { limit: () => Promise<Row[]> };
      promise.limit = limit;
      return promise;
    };
    const chain = (): SelectChain => ({
      orderBy: orderedRows,
      where: () => ({
        limit,
        orderBy: orderedRows,
      }),
      innerJoin: chain,
      leftJoin: chain,
    });
    return { from: chain };
  });
}

/**
 * insert().values(v).returning() — also covers upserts via .onConflictDoUpdate(),
 * whether the caller awaits the conflict step directly or chains .returning().
 * Pass an array to script multiple inserts in call order.
 */
export function stubInsert(db: DbMock, row: Row | Row[]): void {
  db.insert.mockImplementation(() => {
    const result = Array.isArray(row) ? row : [row];
    const returning = async (): Promise<Row[]> => result;
    return {
      values: () => ({
        returning,
        onConflictDoNothing: () => ({ rowCount: 0 }),
        onConflictDoUpdate: () => {
          const promise = Promise.resolve(result) as Promise<Row[]> & {
            returning: typeof returning;
          };
          promise.returning = returning;
          return promise;
        },
      }),
    };
  });
}

/** update().set(v).where(...).returning() */
export function stubUpdate(db: DbMock, row: Row | null): void {
  db.update.mockImplementation(() => ({
    set: () => ({
      where: () => ({
        returning: async () => (row ? [row] : []),
      }),
    }),
  }));
}

/** delete().where(...) — awaits the where() chain directly, or uses .returning() */
export function stubDelete(db: DbMock, row: Row | null): void {
  db.delete.mockImplementation(() => ({
    where: () => {
      const deleted = async (): Promise<Row[]> => (row ? [row] : []);
      const promise = Promise.resolve(row ? [row] : []) as Promise<Row[]> & {
        returning: typeof deleted;
      };
      promise.returning = deleted;
      return promise;
    },
  }));
}

/**
 * Makes db.transaction(cb) invoke cb with the supplied tx mock. Bulk routes run
 * their writes inside db.transaction(async (tx) => ...); script tx.insert etc.
 * exactly like you would on a bare db mock.
 */
export function stubTransaction(db: DbMock, tx: DbMock): void {
  db.transaction.mockImplementation(
    (cb: (inner: DbMock) => Promise<unknown>) => cb(tx),
  );
}

export function jsonRequest(
  url: string,
  method: string = "GET",
  body?: unknown,
): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
