"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, ImagePlus, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { ZodError } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
import { durationSecondsFromParts, splitDurationSeconds } from "@/lib/quizzes/duration";
import { builderBlocks, type BuilderQuestion } from "@/lib/quizzes/builder";
import {
  quizBuilderSaveSchema,
  type QuizBuilderDocument,
  type QuizBuilderSaveInput,
} from "@/lib/validation/quiz-builder";
import {
  collectQuizPublishBlockers,
  type QuizDraftPayloadInput,
  type QuizPublishBlocker,
} from "@/lib/validation/quiz-questions";
import { quizImageUploadSchema } from "@/lib/validation/quiz-images";
import { QuizQuestionBuilder } from "./quiz-question-builder";
import { QuizSettingsPanel } from "./quiz-settings-panel";
import { RichTextEditor, type QuizImageUploader } from "./rich-text-editor";
import { useQuizPreferences } from "./use-quiz-preferences";
import { QuizPreview } from "./quiz-preview";
import { QuizEssayGrading } from "./quiz-essay-grading";
import { QuizBankDialog } from "./quiz-bank-dialog";
import { QuizAvailabilityPanel } from "@/components/admin/quiz-availability-panel";
import { useQuizImageLinks } from "./use-quiz-image-links";
import { refreshQuizRichText, quizImagePaths } from "@/lib/quizzes/images";

function errorIssues(error: unknown): QuizPublishBlocker[] {
  if (error instanceof ZodError)
    return error.issues.map((i) => ({
      path: i.path
        .map(String)
        .join(".")
        .replace(/^payload\./, ""),
      message: i.message,
    }));
  if (error instanceof ApiError && Array.isArray(error.details))
    return error.details.flatMap((issue: unknown) =>
      typeof issue === "object" &&
      issue !== null &&
      "field" in issue &&
      typeof issue.field === "string" &&
      "message" in issue &&
      typeof issue.message === "string"
        ? [{ path: issue.field.replace(/^payload\./, ""), message: issue.message }]
        : [],
    );
  return [];
}
function issueLabel(issue: QuizPublishBlocker): string {
  const path = issue.path.split(".");
  return `${path[0] === "questions" && /^\d+$/.test(path[1] ?? "") ? `Question ${Number(path[1]) + 1}: ` : path[0] === "passages" && /^\d+$/.test(path[1] ?? "") ? `Passage ${Number(path[1]) + 1}: ` : ""}${issue.message}`;
}
export function QuizBuilderEditor({
  document,
  basePath,
}: {
  document: QuizBuilderDocument;
  basePath: string;
}) {
  const client = useQueryClient();
  const preferences = useQuizPreferences();
  const [payload, setPayload] = useState<QuizDraftPayloadInput>(document);
  const imageLinks = useQuizImageLinks(String(document.id), true, Boolean(payload.details.coverImagePath) || [payload.details.description ?? "", payload.details.instructions ?? "", ...payload.passages.map((p) => p.bodyRichText), ...payload.questions.flatMap((q) => [q.bodyRichText, q.reasonRichText ?? "", ...(q.options ?? []).map((o) => o.optionText)])].some((html) => quizImagePaths(html).length > 0));
  const refreshRich = (html: string) => refreshQuizRichText(html, imageLinks);
  const visiblePassages = payload.passages.map((p) => ({ ...p, bodyRichText: refreshRich(p.bodyRichText) }));
  const [coverUrl, setCoverUrl] = useState(document.coverImageUrl);
  const [preview, setPreview] = useState(false);
  const [bank, setBank] = useState(false);
  const [serverIssues, setServerIssues] = useState<QuizPublishBlocker[]>([]);
  const [formError, setFormError] = useState("");
  const coverInput = useRef<HTMLInputElement>(null);
  const discardedCovers = useRef(new Set<string>());
  const published = document.status === "published";
  const updateDetails = (patch: Partial<QuizDraftPayloadInput["details"]>) =>
    setPayload((old) => ({ ...old, details: { ...old.details, ...patch } }));
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      quizImageUploadSchema.parse(file);
      const body = new FormData();
      body.append("file", file);
      return (
        await apiFetch<{ data: { url: string; path: string } }>(
          `/teacher/quizzes/${document.id}/images`,
          { method: "POST", body },
        )
      ).data;
    },
  });
  const uploadImage: QuizImageUploader = (file) => uploadMutation.mutateAsync(file);
  const addCover = async (file: File) => {
    try {
      const result = await uploadImage(file);
      if (payload.details.coverImagePath)
        discardedCovers.current.add(payload.details.coverImagePath);
      updateDetails({ coverImagePath: result.path });
      setCoverUrl(result.url);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Image upload failed");
    }
  };
  const saveMutation = useMutation({
    mutationFn: (input: QuizBuilderSaveInput) =>
      apiFetch(`/teacher/quizzes/${document.id}/builder`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      for (const path of discardedCovers.current) {
        try {
          await apiFetch(`/teacher/quizzes/${document.id}/images`, {
            method: "DELETE",
            body: JSON.stringify({ path }),
          });
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 409))
            toast.error("The quiz was saved, but an unused cover could not be removed.");
        }
      }
      discardedCovers.current.clear();
      toast.success("Quiz saved.");
      await client.invalidateQueries({ queryKey: ["quiz-builder", String(document.id)] });
      await client.invalidateQueries({ queryKey: ["teacher", "quizzes"] });
    },
    onError: (error) => {
      setFormError(error.message);
      setServerIssues(errorIssues(error));
    },
  });
  const blockers = collectQuizPublishBlockers(payload);
  if (document.quizType === "course" && payload.questions.length !== 50)
    blockers.unshift({
      path: "questions",
      message: `Course quizzes require exactly 50 questions (${payload.questions.length} currently).`,
    });
  const issues = [...blockers, ...serverIssues];
  const save = (action: "draft" | "publish") => {
    setFormError("");
    setServerIssues([]);
    try {
      saveMutation.mutate(
        quizBuilderSaveSchema.parse({ action, revision: document.revision, payload }),
      );
    } catch (error) {
      setFormError("Review the highlighted fields.");
      setServerIssues(errorIssues(error));
    }
  };
  const duration = splitDurationSeconds(payload.details.durationSeconds ?? 0);
  const detailError = (field: string) =>
    issues
      .filter((e) => e.path === `details.${field}`)
      .map((e) => (
        <p key={`${e.path}-${e.message}`} role="alert" className="text-base text-ruby">
          {e.message}
        </p>
      ));
  const questions = payload.questions.map((q, i): BuilderQuestion => ({
    ...q,
    clientKey: q.clientKey ?? `question-${i}`,
    bodyRichText: refreshRich(q.bodyRichText), reasonRichText: refreshRich(q.reasonRichText ?? ""),
    options: q.options?.map((o) => ({ ...o, optionText: refreshRich(o.optionText) })),
  }));
  const activeCoverUrl = payload.details.coverImagePath ? imageLinks.get(payload.details.coverImagePath) ?? coverUrl : null;
  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Link
            href={basePath}
            className="inline-flex min-h-11 items-center text-base text-sub underline-offset-4 hover:underline"
          >
            Back to quizzes
          </Link>
          <h1 className="text-2xl font-semibold text-ink">Build your quiz</h1>
          <p className="text-base text-sub">
            {document.quizType === "course"
              ? `Course Quiz · 50 questions · Week ${document.weekStart}`
              : "Topic Quiz"}
          </p>
          <Badge variant="secondary">{published ? "Published" : "Draft"}</Badge>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 text-base"
          onClick={() => setPreview(true)}
        >
          <Eye className="size-5" />
          Preview
        </Button>
      </header>
      <fieldset
        disabled={published || saveMutation.isPending}
        className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div className="min-w-0 space-y-6">
          <section className="space-y-5 rounded-2xl border border-line bg-panel p-3 sm:p-5">
            <h2 className="text-xl font-semibold text-ink">Quiz details</h2>
            <div className="space-y-2">
              <Label className="text-base">Cover image (optional)</Label>
              <div
                className="space-y-3 rounded-xl border border-dashed border-line bg-canvas p-4 text-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file && !published) void addCover(file);
                }}
              >
                {activeCoverUrl ? (
                  <Image
                    src={activeCoverUrl}
                    alt="Quiz cover preview"
                    width={1200}
                    height={600}
                    unoptimized
                    className="aspect-[2/1] max-h-64 w-full rounded-xl object-cover"
                  />
                ) : (
                  <>
                    <ImagePlus className="mx-auto size-8 text-sub" />
                    <p className="text-base text-sub">
                      Drop a PNG, JPEG or WebP image here (up to 5 MB).
                    </p>
                  </>
                )}
                <input
                  ref={coverInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="Upload quiz cover"
                className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void addCover(file);
                    e.target.value = "";
                  }}
                />
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={uploadMutation.isPending}
                    onClick={() => coverInput.current?.click()}
                  >
                    <Upload className="size-4" />
                    {uploadMutation.isPending
                      ? "Uploading…"
                      : coverUrl
                        ? "Replace cover image"
                        : "Add a cover image"}
                  </Button>
                  {coverUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11 text-ruby"
                      onClick={() => {
                        if (payload.details.coverImagePath)
                          discardedCovers.current.add(payload.details.coverImagePath);
                        updateDetails({ coverImagePath: null });
                        setCoverUrl(null);
                      }}
                    >
                      Remove cover image
                    </Button>
                  )}
                </div>
              </div>
              {detailError("coverImagePath")}
            </div>
            <div className="space-y-1">
              <Label htmlFor="quiz-title" className="text-base">
                Title (required)
              </Label>
              <Input
                id="quiz-title"
                maxLength={200}
                className="min-h-11 text-base"
                value={payload.details.title}
                onChange={(e) => updateDetails({ title: e.target.value })}
                aria-invalid={issues.some((e) => e.path === "details.title")}
              />
              {detailError("title")}
            </div>
            <RichTextEditor
              id="quiz-description"
              label="Description (optional)"
              value={refreshRich(payload.details.description ?? "")}
              onChange={(description) => updateDetails({ description })}
              uploadImage={uploadImage}
            />
            {detailError("description")}
            <RichTextEditor
              id="quiz-instructions"
              label="Instructions (optional)"
              placeholder="Click to edit instructions shown before starting"
              value={refreshRich(payload.details.instructions ?? "")}
              onChange={(instructions) => updateDetails({ instructions })}
              uploadImage={uploadImage}
            />
            {detailError("instructions")}
            <fieldset className="space-y-2">
              <legend className="text-base font-medium text-ink">
                Duration (optional)
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {(["hours", "minutes", "seconds"] as const).map((part) => (
                  <div key={part} className="min-w-0 space-y-1">
                    <Label
                      htmlFor={`quiz-duration-${part}`}
                      className="text-base capitalize"
                    >
                      {part}
                    </Label>
                    <Select
                      value={String(duration[part])}
                      onValueChange={(value) =>
                        updateDetails({
                          durationSeconds: durationSecondsFromParts({
                            ...duration,
                            [part]: Number(value),
                          }),
                        })
                      }
                    >
                      <SelectTrigger
                        id={`quiz-duration-${part}`}
                        className="min-h-11 w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(
                          { length: part === "hours" ? 100 : 60 },
                          (_, value) => (
                            <SelectItem key={value} value={String(value)}>
                              {value}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <p className="text-base text-sub">
                Leave all three at zero for no time limit.
              </p>
              {detailError("durationSeconds")}
            </fieldset>
            <div className="max-w-48 space-y-1">
              <Label htmlFor="quiz-pass-mark" className="text-base">
                Pass mark (optional, %)
              </Label>
              <Input
                id="quiz-pass-mark"
                type="number"
                min={1}
                max={100}
                step={1}
                className="min-h-11 text-base"
                value={payload.details.passMark}
                onChange={(e) =>
                  updateDetails({
                    passMark: e.target.value === "" ? 60 : Number(e.target.value),
                  })
                }
                aria-invalid={issues.some((e) => e.path === "details.passMark")}
              />
              {detailError("passMark")}
            </div>
          </section>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setBank(true)}
          >
            Add from question bank
          </Button>
          <QuizQuestionBuilder
            questions={questions}
            passages={visiblePassages}
            onChange={(nextQuestions, nextPassages) =>
              setPayload((old) => ({
                ...old,
                questions: builderBlocks(nextQuestions, nextPassages).flatMap(
                  (b) => b.questions,
                ),
                passages: nextPassages,
              }))
            }
            errors={issues}
            uploadImage={uploadImage}
          />
        </div>
        <QuizSettingsPanel
          value={payload.settings}
          onChange={(settings) => setPayload((old) => ({ ...old, settings }))}
          pinned={preferences.pinned}
          onPin={preferences.pin}
          onSaveDefaults={() => preferences.saveDefaults(payload.settings)}
          savingDefaults={preferences.mutation.isPending || preferences.query.isPending}
          error={preferences.query.error?.message ?? preferences.mutation.error?.message}
          errors={issues}
        />
      </fieldset>
      {published && questions.some((q) => q.questionType === "essay") && (
        <QuizEssayGrading quizId={document.id} />
      )}
      {published && basePath.startsWith("/admin") && document.quizType === "course" && (
        <QuizAvailabilityPanel
          quizId={document.id}
          weekStart={document.weekStart}
          opensAt={document.settings.opensAt?.toISOString() ?? null}
          closesAt={document.settings.closesAt?.toISOString() ?? null}
        />
      )}
      {formError && (
        <p
          role="alert"
          className="rounded-xl border border-ruby/30 bg-panel p-3 text-base text-ruby"
        >
          {formError}
        </p>
      )}
      {!published && issues.length > 0 && (
        <section
          className="rounded-xl border border-line bg-panel p-4"
          aria-labelledby="publish-blockers-heading"
        >
          <h2 id="publish-blockers-heading" className="text-base font-semibold text-ink">
            What blocks publishing ({issues.length})
          </h2>
          <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-base text-sub">
            {issues.map((issue, i) => (
              <li key={`${issue.path}-${i}`}>{issueLabel(issue)}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3 sm:p-4">
        <p className="text-base text-sub">
          {published
            ? "Published quiz · editing is locked"
            : "Drafts may contain unfinished questions."}
        </p>
        {!published && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={saveMutation.isPending || uploadMutation.isPending}
              onClick={() => save("draft")}
            >
              <Save className="size-4" />
              {saveMutation.isPending ? "Saving…" : "Save draft"}
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={
                saveMutation.isPending || uploadMutation.isPending || blockers.length > 0
              }
              onClick={() => save("publish")}
            >
              Publish
            </Button>
          </div>
        )}
      </div>
      <QuizPreview
        open={preview}
        onOpenChange={setPreview}
        payload={{ ...payload, details: { ...payload.details, description: refreshRich(payload.details.description ?? ""), instructions: refreshRich(payload.details.instructions ?? "") }, questions, passages: visiblePassages }}
        coverUrl={activeCoverUrl}
      />
      <QuizBankDialog
        open={bank}
        onOpenChange={setBank}
        courseId={document.courseId}
        jambSubjectId={document.jambSubjectId}
        quizId={document.id}
        onAdd={(questions, passages) =>
          setPayload((old) => ({ ...old, questions: [...old.questions, ...questions], passages: [...old.passages, ...passages] }))
        }
      />
    </div>
  );
}
