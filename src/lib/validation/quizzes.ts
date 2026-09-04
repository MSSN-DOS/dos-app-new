import { z } from "zod";

const nullableInt = z.union([z.coerce.number().int().min(1), z.null()]);

export const quizCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    quizType: z.enum(["topic", "course"]),
    courseId: nullableInt.optional(),
    jambSubjectId: nullableInt.optional(),
    topicId: nullableInt.optional(),
    weekStart: z.string().nullish(),
  })
  .superRefine((data, ctx) => {
    if (data.courseId != null && data.jambSubjectId != null) {
      ctx.addIssue({
        code: "custom",
        path: ["jambSubjectId"],
        message: "A quiz cannot belong to both a course and a JAMB subject",
      });
    }
    if (data.courseId == null && data.jambSubjectId == null) {
      ctx.addIssue({
        code: "custom",
        path: ["courseId"],
        message: "Pick a course or a JAMB subject for this quiz",
      });
    }

    if (data.quizType === "topic") {
      if (data.topicId == null) {
        ctx.addIssue({
          code: "custom",
          path: ["topicId"],
          message: "Pick a topic for a topic quiz",
        });
      }
      if (data.weekStart != null) {
        ctx.addIssue({
          code: "custom",
          path: ["weekStart"],
          message: "Topic quizzes are not tied to a week",
        });
      }
    }

    if (data.quizType === "course") {
      if (data.topicId != null) {
        ctx.addIssue({
          code: "custom",
          path: ["topicId"],
          message: "Course quizzes cannot be tied to a topic",
        });
      }
      if (data.weekStart == null) {
        ctx.addIssue({
          code: "custom",
          path: ["weekStart"],
          message: "Course quizzes need a week start date",
        });
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.weekStart)) {
        ctx.addIssue({
          code: "custom",
          path: ["weekStart"],
          message: "Week start must be a date in YYYY-MM-DD format",
        });
      } else {
        const day = new Date(`${data.weekStart}T00:00:00Z`).getUTCDay();
        if (day !== 6) {
          ctx.addIssue({
            code: "custom",
            path: ["weekStart"],
            message: "Week start must fall on a Saturday",
          });
        }
      }
    }
  });

export type QuizCreateInput = z.infer<typeof quizCreateSchema>;

export const quizUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    instructions: z.string().trim().max(5000).optional(),
    questionCount: z.coerce.number().int().min(1).max(100),
    timeLimitMinutes: z.coerce.number().int().min(1).max(600),
    passMark: z.coerce.number().int().min(1).max(100),
    allowMultipleAttempts: z.boolean(),
    loseFocusPolicy: z.enum(["ignore", "warn", "auto_submit"]),
    weekStart: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.weekStart != null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.weekStart)) {
        ctx.addIssue({
          code: "custom",
          path: ["weekStart"],
          message: "Week start must be a date in YYYY-MM-DD format",
        });
      } else {
        const day = new Date(`${data.weekStart}T00:00:00Z`).getUTCDay();
        if (day !== 6) {
          ctx.addIssue({
            code: "custom",
            path: ["weekStart"],
            message: "Week start must fall on a Saturday",
          });
        }
      }
    }
  });

export type QuizUpdateInput = z.infer<typeof quizUpdateSchema>;
