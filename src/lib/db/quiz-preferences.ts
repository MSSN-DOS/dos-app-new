import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import {
  quizPreferencesSchema,
  focusLossPolicyFor,
  initialQuizSettings,
  type QuizPreferences,
} from "@/lib/validation/quiz-settings";

const preferenceKey = "quiz-authoring";
/** Apply personal settings only; each quiz needs fresh schedule dates. */
export async function newQuizSettings(userId: number) {
  const preferences = await readQuizPreferences(userId);
  const {
    visibility: _visibility,
    permitFocusLoss,
    ...settings
  } = preferences.defaults ?? initialQuizSettings;
  void _visibility;
  return {
    ...settings,
    opensAt: null,
    closesAt: null,
    loseFocusPolicy: focusLossPolicyFor(permitFocusLoss),
  };
}
export async function readQuizPreferences(userId: number): Promise<QuizPreferences> {
  const [row] = await getDb()
    .select({ value: userPreferences.value })
    .from(userPreferences)
    .where(
      and(eq(userPreferences.userId, userId), eq(userPreferences.key, preferenceKey)),
    )
    .limit(1);
  const parsed = quizPreferencesSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : { defaults: null, pinned: [] };
}
export async function writeQuizPreferences(
  userId: number,
  preferences: QuizPreferences,
): Promise<QuizPreferences> {
  const value: QuizPreferences = {
    ...preferences,
    defaults: preferences.defaults
      ? { ...preferences.defaults, opensAt: null, closesAt: null }
      : null,
  };
  await getDb()
    .insert(userPreferences)
    .values({ userId, key: preferenceKey, value })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.key],
      set: { value, updatedAt: new Date() },
    });
  return value;
}
