import { quizImageUploadSchema } from "@/lib/validation/quiz-images";
/** Normalize authoring/pasted/cover images before the authenticated Storage upload. */
export async function resizeQuizImage(file: File): Promise<File> {
  quizImageUploadSchema.parse(file);
  const bitmap = await createImageBitmap(file);
  try {
    if (Math.max(bitmap.width, bitmap.height) <= 900) return file;
    const scale = 900 / Math.max(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this image");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("Could not resize the image")),
        "image/jpeg",
        0.82,
      ),
    );
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } finally {
    bitmap.close();
  }
}
