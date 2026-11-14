import { z } from "zod";
import { quizDetailsSchema } from "./quiz-details";
import { MAX_QUIZ_IMAGE_BYTES } from "@/lib/quizzes/images";
export const quizImageRemovalSchema = z.object({ path: quizDetailsSchema.shape.coverImagePath.unwrap().unwrap() });
export const quizImageUploadSchema = z.custom<Blob>((value) => value !== null && typeof value === "object" && "arrayBuffer" in value && "size" in value && "type" in value)
  .refine((file) => file != null && file.size > 0 && file.size <= MAX_QUIZ_IMAGE_BYTES, "Choose an image up to 5 MB")
  .refine((file) => file != null && ["image/png", "image/jpeg", "image/webp"].includes(file.type), "Choose a PNG, JPEG or WebP image");
