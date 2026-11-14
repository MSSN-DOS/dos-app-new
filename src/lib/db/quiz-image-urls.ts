import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { quizImages } from "@/lib/db/schema";
import { quizImagePaths } from "@/lib/quizzes/images";
import { createQuizImageSignedUrl } from "@/lib/storage/supabase-storage";
export async function quizImageUrls(db: Pick<Db, "select">, quizId: number, texts: readonly string[], coverPath?: string | null): Promise<Map<string, string>> {
  const paths = [...new Set([...texts.flatMap(quizImagePaths), ...(coverPath ? [coverPath] : [])])];
  if (!paths.length) return new Map();
  const rows = await db.select({ objectPath: quizImages.objectPath }).from(quizImages).where(and(eq(quizImages.quizId, quizId), inArray(quizImages.objectPath, paths))).orderBy(asc(quizImages.id));
  return new Map(await Promise.all(rows.map(async (row) => [row.objectPath, await createQuizImageSignedUrl(row.objectPath)] as const)));
}
