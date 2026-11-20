"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Eye,
  ImagePlus,
  Save,
  Printer,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { ZodError } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
import { formatDurationSeconds } from "@/lib/quizzes/duration";
import { builderBlocks, type BuilderQuestion } from "@/lib/quizzes/builder";
import { sumMarks } from "@/lib/quizzes/marks";
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
import { QuizSettingsCompact } from "./quiz-settings-compact";
import { ResultsDetailView } from "./results-detail-view";
import { RichTextEditor, type QuizImageUploader } from "./rich-text-editor";
import { QuizPreview } from "./quiz-preview";
import { QuizEssayGrading } from "./quiz-essay-grading";
import { QuizBankDialog } from "./quiz-bank-dialog";
import { QuizAvailabilityPanel } from "@/components/admin/quiz-availability-panel";
import { useQuizImageLinks } from "./use-quiz-image-links";
import { refreshQuizRichText, quizImagePaths } from "@/lib/quizzes/images";
import {
  draftFingerprint,
  reconcileSavedBuilder,
  type BuilderSaveResult,
} from "@/lib/quizzes/autosave";
import { resizeQuizImage } from "@/lib/quizzes/resize-image";
import { QuizBulkDialog } from "./quiz-bulk-dialog";
import { QuizPrintDialog } from "./quiz-print-dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

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
  const [payload, setPayload] = useState<QuizDraftPayloadInput>(document);
  const imageLinks = useQuizImageLinks(
    String(document.id),
    true,
    Boolean(payload.details.coverImagePath) ||
      [
        payload.details.description ?? "",
        payload.details.instructions ?? "",
        ...payload.passages.map((p) => p.bodyRichText),
        ...payload.questions.flatMap((q) => [
          q.bodyRichText,
          q.reasonRichText ?? "",
          ...(q.options ?? []).map((o) => o.optionText),
        ]),
      ].some((html) => quizImagePaths(html).length > 0),
  );
  const refreshRich = (html: string) => refreshQuizRichText(html, imageLinks);
  const visiblePassages = payload.passages.map((p) => ({
    ...p,
    bodyRichText: refreshRich(p.bodyRichText),
  }));
  const [coverUrl, setCoverUrl] = useState(document.coverImageUrl);
  const [preview, setPreview] = useState(false);
  const [activeTab, setActiveTab] = useState("questions");
  const [bank, setBank] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [print, setPrint] = useState(false);
  const [unpublish, setUnpublish] = useState(false);
  const [status, setStatus] = useState(document.status);
  const [hasAttempts, setHasAttempts] = useState(document.hasAttempts);
  const [saveStatus, setSaveStatus] = useState("All changes saved");
  const [autosavePaused, setAutosavePaused] = useState(false);
  const revision = useRef(document.revision);
  const latestPayload = useRef(payload);
  const savedFingerprint = useRef(draftFingerprint(document));
  const [savedVersion, setSavedVersion] = useState(() => draftFingerprint(document));
  const inFlight = useRef(false);
  const [saveTick, setSaveTick] = useState(0);
  const [serverIssues, setServerIssues] = useState<QuizPublishBlocker[]>([]);
  const [formError, setFormError] = useState("");
  const coverInput = useRef<HTMLInputElement>(null);
  const discardedCovers = useRef(new Set<string>());
  const published = status === "published";
  const locked = published || hasAttempts;
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
      const result = await uploadImage(await resizeQuizImage(file));
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
      apiFetch<{ data: BuilderSaveResult }>(`/teacher/quizzes/${document.id}/builder`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: async (response, input) => {
      revision.current = response.data.revision ?? input.revision + 1;
      savedFingerprint.current = draftFingerprint(input.payload);
      setSavedVersion(draftFingerprint(input.payload));
      setPayload((current) =>
        reconcileSavedBuilder(current, input.payload, {
          ...response.data,
          questionIds: response.data.questionIds ?? [],
          passageIds: response.data.passageIds ?? {},
        }),
      );
      setStatus(
        response.data.status ?? (input.action === "publish" ? "published" : "draft"),
      );
      setSaveStatus("All changes saved");
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
      if (input.action === "publish") toast.success("Quiz published.");
      await client.invalidateQueries({ queryKey: ["teacher", "quizzes"] });
    },
    onError: (error) => {
      setAutosavePaused(true);
      setSaveStatus("Save failed — your edits remain here. Retry Save draft.");
      setFormError(error.message);
      setServerIssues(errorIssues(error));
    },
  });
  const lifecycle = useMutation({
    mutationFn: (action: "unpublish" | "republish") =>
      apiFetch<{
        data: { status: "draft" | "published"; revision: number; hasAttempts: boolean };
      }>(`/teacher/quizzes/${document.id}/builder`, {
        method: "PATCH",
        body: JSON.stringify({ action, revision: revision.current }),
      }),
    onSuccess: async ({ data }) => {
      revision.current = data.revision;
      setHasAttempts(data.hasAttempts);
      setStatus(data.status);
      setUnpublish(false);
      toast.success(
        data.status === "published"
          ? "Quiz republished."
          : "Quiz unpublished. Started attempts can finish.",
      );
      await client.invalidateQueries({ queryKey: ["teacher", "quizzes"] });
    },
    onError: (error) => setFormError(error.message),
  });
  const blockers = collectQuizPublishBlockers(payload);
  if (document.quizType === "course" && payload.questions.length !== 50)
    blockers.unshift({
      path: "questions",
      message: `Course quizzes require exactly 50 questions (${payload.questions.length} currently).`,
    });
  const issues = [...blockers, ...serverIssues];
  const save = async (action: "draft" | "publish") => {
    if (inFlight.current || uploadMutation.isPending || locked) return;
    inFlight.current = true;
    setAutosavePaused(false);
    setSaveStatus("Saving…");
    setFormError("");
    setServerIssues([]);
    try {
      await saveMutation.mutateAsync(
        quizBuilderSaveSchema.parse({
          action,
          revision: revision.current,
          payload: latestPayload.current,
        }),
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Review the highlighted fields.",
      );
      setServerIssues(errorIssues(error));
      setAutosavePaused(true);
      setSaveStatus("Unsaved changes — review errors and retry Save draft.");
    } finally {
      inFlight.current = false;
      setSaveTick((tick) => tick + 1);
    }
  };
  const saveLatest = useRef(save);
  useEffect(() => {
    latestPayload.current = payload;
    saveLatest.current = save;
  });
  const fingerprint = draftFingerprint(payload);
  useEffect(() => {
    if (
      locked ||
      autosavePaused ||
      uploadMutation.isPending ||
      fingerprint === savedFingerprint.current
    )
      return;
    const timer = window.setTimeout(() => {
      if (!inFlight.current) void saveLatest.current("draft");
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [fingerprint, locked, autosavePaused, uploadMutation.isPending, saveTick]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (
        inFlight.current ||
        draftFingerprint(latestPayload.current) !== savedFingerprint.current
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
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
    bodyRichText: refreshRich(q.bodyRichText),
    reasonRichText: refreshRich(q.reasonRichText ?? ""),
    options: q.options?.map((o) => ({ ...o, optionText: refreshRich(o.optionText) })),
  }));
  const activeCoverUrl = payload.details.coverImagePath
    ? (imageLinks.get(payload.details.coverImagePath) ?? coverUrl)
    : null;
  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-4 pb-6">
      <header className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
        <div className="min-w-0 flex-1 space-y-1">
          <Link
            href={basePath}
            className="inline-flex min-h-11 items-center gap-2 rounded-md text-base text-sub underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" /> Back to quizzes
          </Link>
          <Input
            aria-label="Quiz header title"
            maxLength={200}
            disabled={locked}
            className="min-h-11 w-full border-transparent bg-transparent px-0 text-xl font-semibold text-ink hover:border-line focus-visible:px-2"
            value={payload.details.title}
            placeholder="Untitled quiz"
            onChange={(e) => updateDetails({ title: e.target.value })}
          />
          <p role="status" className="text-base text-sub">
            {saveMutation.isPending
              ? "Saving…"
              : fingerprint !== savedVersion
                ? autosavePaused
                  ? saveStatus
                  : "Unsaved changes · autosave pending"
                : saveStatus}
          </p>
          <p className="text-base text-sub">
            {document.quizType === "course"
              ? `Course Quiz · 50 questions · Week ${document.weekStart}`
              : "Topic Quiz"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 text-base"
          aria-label="Question paper"
          onClick={() => setPrint(true)}
        >
          <Printer className="size-5" />
          <span className="sr-only md:not-sr-only">Print / PDF</span>
        </Button>
        {!published && (
          <Button
            className="min-h-11 text-base"
            disabled={
              saveMutation.isPending || lifecycle.isPending || blockers.length > 0
            }
            onClick={() =>
              hasAttempts ? lifecycle.mutate("republish") : void save("publish")
            }
          >
            {hasAttempts ? "Republish" : "Publish"}
          </Button>
        )}
        <Badge
          variant="secondary"
          className={published ? "bg-success/10 text-ink" : "text-sub"}
        >
          {published ? "Published" : "Draft"}
        </Badge>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 text-base"
          onClick={() => setPreview(true)}
        >
          <Eye className="size-5" />
          <span className="sr-only md:not-sr-only">Preview</span>
        </Button>
      </header>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0 gap-4">
        <TabsList
          variant="line"
          aria-label="Quiz sections"
          className="grid min-h-12 w-full grid-cols-3 border-b border-line p-0"
        >
          {[
            ["questions", "Questions"],
            ["settings", "Settings"],
            ["results", "Results"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="min-h-11 px-2 text-base data-[state=active]:text-brand"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-w-0">
          <TabsContent value="settings" className="min-w-0 space-y-4">
            <fieldset
              disabled={
                locked ||
                lifecycle.isPending ||
                (saveMutation.isPending && saveMutation.variables?.action === "publish")
              }
            >
              <QuizSettingsCompact
                value={payload.settings}
                details={payload.details}
                onDetailsChange={updateDetails}
                quizType={document.quizType}
                onChange={(settings) => setPayload((old) => ({ ...old, settings }))}
                errors={issues}
                advancedContent={
                  <section className="space-y-5 rounded-2xl border border-line bg-panel p-3 sm:p-5">
                    <h3 className="text-base font-semibold text-ink">
                      Instructions, description and cover
                    </h3>
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
                                  discardedCovers.current.add(
                                    payload.details.coverImagePath,
                                  );
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
                  </section>
                }
              />
            </fieldset>
          </TabsContent>
          <TabsContent
            value="questions"
            className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]"
          >
            <div className="min-w-0 space-y-4">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full text-base sm:w-auto"
                onClick={() => setBank(true)}
              >
                <BookOpen className="size-4" /> Add from question bank
              </Button>
              <QuizQuestionBuilder
                onOpenBank={() => setBank(true)}
                onOpenBulk={() => setBulk(true)}
                collapseSavedQuestions
                readOnly={
                  locked ||
                  lifecycle.isPending ||
                  (saveMutation.isPending && saveMutation.variables?.action === "publish")
                }
                questions={questions}
                passages={visiblePassages}
                onChange={(nextQuestions, nextPassages) =>
                  !locked &&
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
            <aside
              aria-label="Quiz summary"
              className="order-first rounded-xl border border-line bg-panel p-4 lg:order-last lg:sticky lg:top-20"
            >
              <dl className="grid grid-cols-3 gap-2 text-center lg:gap-3">
                {[
                  { label: "Questions", value: questions.length },
                  { label: "Marks", value: sumMarks(questions.map((q) => q.marks)) },
                  {
                    label: "Time",
                    value: payload.details.durationSeconds
                      ? formatDurationSeconds(payload.details.durationSeconds)
                      : "Untimed",
                  },
                ].map(({ label, value }) => (
                  <div key={label} className="min-w-0">
                    <dd className="break-words text-xl font-semibold tabular-nums text-ink">
                      {value}
                    </dd>
                    <dt className="mt-1 text-base text-sub">{label}</dt>
                  </div>
                ))}
              </dl>
              <p
                className={`mt-4 flex items-start gap-2 border-t border-line pt-3 text-base ${blockers.length ? "text-sub" : "text-ink"}`}
              >
                {!blockers.length && (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                )}
                {published
                  ? "Published · editing locked"
                  : blockers.length
                    ? `${blockers.length} things to review before publishing`
                    : "Ready to publish"}
              </p>
              {!published && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-2 min-h-11 w-full text-base text-brand"
                  onClick={() => setActiveTab("settings")}
                >
                  Edit quiz details and settings
                </Button>
              )}
            </aside>
          </TabsContent>
        </div>
        <TabsContent value="results" className="min-w-0 space-y-4">
          {published || hasAttempts ? (
            <ResultsDetailView
              backHref={basePath}
              quizId={String(document.id)}
              embedded
            />
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-panel p-6 text-center">
              <h2 className="text-lg font-semibold text-ink">No results yet</h2>
              <p className="mt-2 text-base text-sub">
                Publish the quiz to start collecting attempts. Scores stay held until an
                Admin releases them.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
      {(published || hasAttempts) &&
        activeTab === "results" &&
        questions.some((q) => q.questionType === "essay") && (
          <QuizEssayGrading quizId={document.id} />
        )}
      {published &&
        !hasAttempts &&
        activeTab === "settings" &&
        basePath.startsWith("/admin") &&
        document.quizType === "course" && (
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
      {!locked && (
        <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex flex-col gap-3 rounded-xl border border-line bg-panel p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4 lg:bottom-0">
          <p className="text-base text-sub">
            {published
              ? "Published quiz · editing is locked"
              : "Drafts may contain unfinished questions."}
          </p>
          {!locked && (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
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
                  saveMutation.isPending ||
                  uploadMutation.isPending ||
                  blockers.length > 0
                }
                onClick={() => save("publish")}
              >
                Publish
              </Button>
            </div>
          )}
          {published && (
            <Button
              className="min-h-11 text-base"
              variant="outline"
              disabled={lifecycle.isPending || saveMutation.isPending}
              onClick={() => setUnpublish(true)}
            >
              Unpublish
            </Button>
          )}
          {!published && hasAttempts && (
            <Button
              className="min-h-11 text-base"
              disabled={lifecycle.isPending || blockers.length > 0}
              onClick={() => lifecycle.mutate("republish")}
            >
              Republish
            </Button>
          )}
        </div>
      )}
      {hasAttempts && (
        <p
          role="status"
          className="rounded-xl border border-line bg-canvas p-3 text-base text-sub"
        >
          Questions and settings are locked because this quiz has recorded attempts.
          Unpublish hides new access and lets started attempts finish.
        </p>
      )}
      <AlertDialog open={unpublish} onOpenChange={setUnpublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish this quiz?</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              Students cannot start new attempts. Started attempts can finish; recorded
              questions and settings remain locked. You can republish later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              onClick={() => lifecycle.mutate("unpublish")}
            >
              Unpublish quiz
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {published && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-base">
          <p>Published · editing locked</p>
          <Button
            variant="outline"
            className="min-h-11 text-base"
            disabled={lifecycle.isPending}
            onClick={() => setUnpublish(true)}
          >
            Unpublish
          </Button>
        </div>
      )}
      <QuizBulkDialog
        open={bulk}
        onOpenChange={setBulk}
        onAdd={(questions) =>
          setPayload((old) => ({ ...old, questions: [...old.questions, ...questions] }))
        }
      />
      <QuizPrintDialog
        open={print}
        onOpenChange={setPrint}
        payload={{ ...payload, questions, passages: visiblePassages }}
      />
      <QuizPreview
        open={preview}
        onOpenChange={setPreview}
        payload={{
          ...payload,
          details: {
            ...payload.details,
            description: refreshRich(payload.details.description ?? ""),
            instructions: refreshRich(payload.details.instructions ?? ""),
          },
          questions,
          passages: visiblePassages,
        }}
        coverUrl={activeCoverUrl}
      />
      <QuizBankDialog
        open={bank}
        onOpenChange={setBank}
        courseId={document.courseId}
        jambSubjectId={document.jambSubjectId}
        quizId={document.id}
        onAdd={(questions, passages) =>
          setPayload((old) => ({
            ...old,
            questions: [...old.questions, ...questions],
            passages: [...old.passages, ...passages],
          }))
        }
      />
    </div>
  );
}
