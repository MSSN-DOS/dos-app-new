"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Eye,
  ImagePlus,
  Save,
  Printer,
  Trash2,
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
import { DeleteQuizDialog } from "./delete-quiz-dialog";
import { QuizPublishDialog, PublishIssueList } from "./quiz-publish-dialog";
import { issueTarget, questionProgress } from "@/lib/quizzes/publish-issues";
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
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const router = useRouter();
  const isAdmin = basePath.startsWith("/admin");
  const [focusRequest, setFocusRequest] = useState<{
    kind: "question" | "passage";
    index: number;
    nonce: number;
  } | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
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
  const [serverIssues, setServerIssues] = useState<{
    fingerprint: string;
    issues: QuizPublishBlocker[];
  } | null>(null);
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
  const fingerprint = draftFingerprint(payload);
  const issues = [
    ...blockers,
    ...(serverIssues?.fingerprint === fingerprint ? serverIssues.issues : []),
  ];
  const goToIssue = (issue: QuizPublishBlocker) => {
    const target = issueTarget(issue.path);
    setPublishOpen(false);
    if (target.kind === "title") {
      titleInput.current?.focus();
      titleInput.current?.scrollIntoView?.({ block: "center" });
      return;
    }
    if (target.kind === "settings") {
      setActiveTab("settings");
      window.setTimeout(() => {
        const first = globalThis.document.querySelector(
          '[data-slot="tabs-content"][data-state="active"] [role="alert"]',
        );
        first?.scrollIntoView?.({ block: "center" });
      }, 60);
      return;
    }
    setActiveTab("questions");
    if (target.kind === "list") {
      window.setTimeout(
        () =>
          globalThis.document
            .getElementById("question-builder-heading")
            ?.scrollIntoView?.({ block: "start" }),
        60,
      );
      return;
    }
    setFocusRequest({ ...target, nonce: Date.now() });
  };
  const requiredCount = document.quizType === "course" ? 50 : null;
  const save = async (action: "draft" | "publish") => {
    if (inFlight.current || uploadMutation.isPending || locked) return;
    inFlight.current = true;
    setAutosavePaused(false);
    setSaveStatus("Saving…");
    setFormError("");
    setServerIssues(null);
    const submittedPayload = latestPayload.current;
    try {
      await saveMutation.mutateAsync(
        quizBuilderSaveSchema.parse({
          action,
          revision: revision.current,
          payload: submittedPayload,
        }),
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Review the highlighted fields.",
      );
      setServerIssues({
        fingerprint: draftFingerprint(submittedPayload),
        issues: errorIssues(error),
      });
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
      <header className="space-y-2">
        <Link
          href={basePath}
          className="inline-flex min-h-11 items-center gap-2 rounded-md text-base text-sub underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" /> Back to quizzes
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Input
            ref={titleInput}
            aria-label="Quiz header title"
            maxLength={200}
            disabled={locked}
            className="min-h-11 min-w-0 flex-[1_1_16rem] border-transparent bg-transparent px-2 text-2xl font-bold text-ink hover:border-line focus-visible:border-ring"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
            value={payload.details.title}
            placeholder="Untitled quiz"
            onChange={(e) => updateDetails({ title: e.target.value })}
          />
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 min-w-11 text-base"
              aria-label="Question paper"
              onClick={() => setPrint(true)}
            >
              <Printer className="size-5" />
              <span className="sr-only lg:not-sr-only">Print</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 min-w-11 text-base"
              onClick={() => setPreview(true)}
            >
              <Eye className="size-5" />
              <span className="sr-only lg:not-sr-only">Preview</span>
            </Button>
            {!locked && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 min-w-11 text-base"
                aria-label="Save draft"
                disabled={saveMutation.isPending || uploadMutation.isPending}
                onClick={() => void save("draft")}
              >
                <Save className="size-5" />
                <span className="sr-only lg:not-sr-only">
                  {saveMutation.isPending ? "Saving…" : "Save draft"}
                </span>
              </Button>
            )}
            {isAdmin && (published || !hasAttempts) && (
              <Button
                type="button"
                variant="outline"
                className={`min-h-11 min-w-11 text-base ${hasAttempts ? "" : "text-ruby hover:text-ruby"}`}
                aria-label={hasAttempts ? "Archive quiz" : "Delete quiz"}
                disabled={saveMutation.isPending || lifecycle.isPending || uploadMutation.isPending}
                onClick={() => setDeleteOpen(true)}
              >
                {hasAttempts ? <Archive className="size-5" /> : <Trash2 className="size-5" />}
                <span className="sr-only lg:not-sr-only">{hasAttempts ? "Archive" : "Delete"}</span>
              </Button>
            )}
            {!published && (
              <Button
                className="ml-auto min-h-11 px-5 text-base sm:ml-0"
                aria-label={
                  blockers.length ? `Publish (${blockers.length} to fix)` : "Publish"
                }
                disabled={
                  saveMutation.isPending ||
                  uploadMutation.isPending ||
                  lifecycle.isPending
                }
                onClick={() => setPublishOpen(true)}
              >
                {hasAttempts ? "Republish" : "Publish"}
                {blockers.length > 0 && (
                  <span
                    aria-hidden
                    className="ml-1 rounded-full bg-primary-foreground/20 px-2 text-sm tabular-nums"
                  >
                    {blockers.length}
                  </span>
                )}
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-sub">
          <Badge
            variant="secondary"
            className={published ? "bg-success/10 text-ink" : "text-sub"}
          >
            {published ? "Published" : hasAttempts ? "Archived" : "Draft"}
          </Badge>
          <span>
            {document.quizType === "course"
              ? `Course Quiz · 50 questions · Week ${document.weekStart}`
              : "Topic Quiz"}
          </span>
          <span role="status" className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className={`size-2 rounded-full ${fingerprint !== savedVersion || saveMutation.isPending ? "bg-warning" : "bg-success"}`}
            />
            {saveMutation.isPending
              ? "Saving…"
              : fingerprint !== savedVersion
                ? autosavePaused
                  ? saveStatus
                  : "Unsaved changes · autosave pending"
                : saveStatus}
          </span>
        </div>
      </header>
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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0 gap-4">
        <TabsList
          variant="line"
          aria-label="Quiz sections"
          className="flex min-h-12 w-full justify-start gap-1 border-b border-line p-0"
        >
          {[
            ["questions", "Questions"],
            ["settings", "Settings"],
            ["results", "Results"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="min-h-11 flex-none px-4 text-base data-[state=active]:text-brand"
            >
              {label}
              {value === "questions" && (
                <span className="ml-2 rounded-full bg-line px-2 text-sm tabular-nums text-sub">
                  {questions.length}
                </span>
              )}
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
              <QuizQuestionBuilder
                onOpenBank={() => setBank(true)}
                onOpenBulk={() => setBulk(true)}
                collapseSavedQuestions
                reserveBottomNav={!basePath.startsWith("/admin")}
                focusRequest={focusRequest}
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
              <dl className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Questions", value: questions.length },
                  { label: "Marks", value: sumMarks(questions.map((q) => q.marks)) },
                  {
                    label: "Time",
                    value: payload.details.durationSeconds
                      ? formatDurationSeconds(payload.details.durationSeconds)
                      : "No limit",
                  },
                ].map(({ label, value }) => (
                  <div key={label} className="min-w-0">
                    <dd
                      className="text-xl font-bold tabular-nums leading-tight text-ink"
                      style={{ fontFamily: "var(--font-fraunces), serif" }}
                    >
                      {value}
                    </dd>
                    <dt className="mt-1 text-sm uppercase tracking-wider text-faint">
                      {label}
                    </dt>
                  </div>
                ))}
              </dl>
              {requiredCount !== null && !published && (
                <div className="mt-3 border-t border-line pt-3">
                  {(() => {
                    const progress = questionProgress(questions.length, requiredCount);
                    return (
                      <>
                        <div className="flex items-baseline justify-between text-base">
                          <span className="font-medium text-ink">{progress.label}</span>
                          <span className="text-sm text-sub">
                            {progress.over
                              ? `Remove ${progress.over}`
                              : progress.remaining
                                ? `${progress.remaining} to go`
                                : "Complete"}
                          </span>
                        </div>
                        <div
                          role="progressbar"
                          aria-label="Questions added"
                          aria-valuemin={0}
                          aria-valuemax={requiredCount}
                          aria-valuenow={Math.min(questions.length, requiredCount)}
                          className="mt-2 h-2 overflow-hidden rounded-full bg-line"
                        >
                          <div
                            className={`h-full rounded-full ${progress.over ? "bg-warning" : "bg-brand"}`}
                            style={{ width: `${progress.percent}%` }}
                          />
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
              <div className="mt-3 border-t border-line pt-3 text-base">
                {published ? (
                  <p>Published · editing locked</p>
                ) : issues.length ? (
                  <>
                    <h2
                      id="publish-blockers-heading"
                      className="text-sm font-semibold uppercase tracking-wider text-faint"
                    >
                      What blocks publishing ({issues.length})
                    </h2>
                    <div className="mt-1 max-h-56 overflow-y-auto">
                      <PublishIssueList
                        issues={issues}
                        onSelect={goToIssue}
                        labelledBy="publish-blockers-heading"
                      />
                    </div>
                  </>
                ) : (
                  <p className="flex items-center gap-2 text-ink">
                    <CheckCircle2 className="size-5 shrink-0 text-success" />
                    Ready to publish
                  </p>
                )}
              </div>
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
      {!published && issues.length > 0 && activeTab !== "questions" && (
        <section
          className="rounded-xl border border-line bg-panel p-4"
          aria-labelledby="publish-blockers-tab-heading"
        >
          <h2
            id="publish-blockers-tab-heading"
            className="text-base font-semibold text-ink"
          >
            What blocks publishing ({issues.length})
          </h2>
          <div className="mt-1 max-h-48 overflow-y-auto">
            <PublishIssueList
              issues={issues}
              onSelect={goToIssue}
              labelledBy="publish-blockers-tab-heading"
            />
          </div>
        </section>
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
      {isAdmin && (
        <DeleteQuizDialog
          quiz={
            deleteOpen
              ? { id: document.id, title: payload.details.title.trim() || "Untitled quiz", status, hasAttempts }
              : null
          }
          onOpenChange={setDeleteOpen}
          onCompleted={() => router.push(basePath)}
        />
      )}
      <QuizPublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        issues={issues}
        pending={saveMutation.isPending || lifecycle.isPending}
        onGoToIssue={goToIssue}
        summary={{
          questions: questions.length,
          marks: sumMarks(questions.map((q) => q.marks)),
          time: payload.details.durationSeconds
            ? formatDurationSeconds(payload.details.durationSeconds)
            : "No limit",
          quizType: document.quizType,
          republish: hasAttempts,
        }}
        onConfirm={() => {
          setPublishOpen(false);
          if (hasAttempts) lifecycle.mutate("republish");
          else void save("publish");
        }}
      />
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
