"use client";
import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { builderBlocks, type BuilderQuestion } from "@/lib/quizzes/builder";
import { formatDurationSeconds } from "@/lib/quizzes/duration";
import { renderRichText } from "@/lib/rich-text";
import type { QuizDraftPayloadInput } from "@/lib/validation/quiz-questions";
import { QuizPaperPages } from "./quiz-paper-pages";
import { exportQuizPdf } from "@/lib/quizzes/export-pdf";
export function QuizQuestionPaper({
  payload,
  institution,
  answerKey,
}: {
  payload: QuizDraftPayloadInput;
  institution: string;
  answerKey: boolean;
}) {
  const blocks = builderBlocks(
    payload.questions.map((q, i): BuilderQuestion => ({
      ...q,
      clientKey: q.clientKey ?? `print-${i}`,
    })),
    payload.passages,
  );
  let number = 0;
  const rich = (value: string) => (
    <div
      className="dos-rich-text break-words text-base"
      dangerouslySetInnerHTML={{ __html: renderRichText(value) }}
    />
  );
  return (
    <article className="quiz-paper-content space-y-5 p-4 text-base sm:p-8">
      <header data-paper-block className="space-y-2 border-b pb-4">
        {institution && (
          <p className="text-center text-lg font-semibold">{institution}</p>
        )}
        <h2 className="break-words text-center text-2xl font-semibold">
          {payload.details.title}
        </h2>
        <p className="text-center">
          {payload.questions.length} questions ·{" "}
          {payload.questions.reduce((sum, q) => sum + q.marks, 0)} marks ·{" "}
          {payload.details.durationSeconds
            ? formatDurationSeconds(payload.details.durationSeconds)
            : "Untimed"}
        </p>
        <p>Name: ____________________________ &nbsp; ID No.: __________________</p>
        <p>Date: __________________</p>
        {rich(payload.details.instructions ?? "")}
      </header>
      {blocks.map((block) => (
        <section key={block.key} className="space-y-4">
          {block.passage && (
            <div data-paper-block className="space-y-2">
              <h3 className="text-lg font-semibold">
                {block.passage.title || "Passage"}
              </h3>
              {rich(block.passage.bodyRichText)}
            </div>
          )}
          {block.questions.map((q) => (
            <section
              data-paper-block
              key={q.clientKey}
              className="quiz-paper-question space-y-2"
            >
              <h3 className="font-semibold">
                Question {++number} ({q.marks} marks)
                {q.questionType === "multi_answer" ? " · select all correct answers" : ""}
              </h3>
              {rich(q.bodyRichText.replaceAll("[gap]", "________"))}
              {(q.questionType === "options" || q.questionType === "multi_answer") && (
                <ol className="space-y-1">
                  {q.options?.map((o, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span>{String.fromCharCode(65 + i)}.</span>
                      {rich(o.optionText)}
                    </li>
                  ))}
                </ol>
              )}
              {q.questionType === "numeric" && (
                <p>Answer: __________________ {q.numericUnit}</p>
              )}
              {q.questionType === "essay" && (
                <div className="space-y-8 pb-6">
                  {[0, 1, 2].map((line) => (
                    <div key={line} className="border-b" />
                  ))}
                </div>
              )}
            </section>
          ))}
        </section>
      ))}
      {answerKey && (
        <section className="quiz-paper-key space-y-4 border-t pt-4">
          <h2 data-paper-block data-new-page="true" className="text-xl font-semibold">
            Answer key / marking scheme
          </h2>
          {blocks
            .flatMap((b) => b.questions)
            .map((q, i) => (
              <div
                data-paper-block
                key={q.clientKey}
                className="quiz-paper-question space-y-2"
              >
                <h3 className="font-semibold">
                  Question {i + 1} · {q.marks} marks
                </h3>
                {q.questionType === "essay" ? (
                  <p>Manually graded by the teacher.</p>
                ) : q.questionType === "numeric" ? (
                  <p>
                    {q.numericAnswer} {q.numericUnit} (absolute tolerance ±
                    {q.numericTolerance})
                  </p>
                ) : q.questionType === "fill_in_gap" ? (
                  <p>
                    {q.blanks
                      ?.map((b, j) => `Gap ${j + 1}: ${b.acceptedAnswer}`)
                      .join("; ")}
                  </p>
                ) : (
                  q.options?.map(
                    (o, j) =>
                      o.isCorrect && (
                        <div key={j} className="flex gap-2">
                          <span>{String.fromCharCode(65 + j)}.</span>
                          {rich(o.optionText)}
                        </div>
                      ),
                  )
                )}
                {rich(q.reasonRichText ?? "")}
              </div>
            ))}
        </section>
      )}
    </article>
  );
}
export function QuizPrintDialog({
  open,
  onOpenChange,
  payload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: QuizDraftPayloadInput;
}) {
  const [institution, setInstitution] = useState("");
  const [answerKey, setAnswerKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const output = useRef<HTMLDivElement>(null);
  const print = async () => {
    setBusy(true);
    setError("");
    try {
      await document.fonts.ready;
      await Promise.all(
        Array.from(output.current?.querySelectorAll("img") ?? []).map((img) =>
          img.decode().catch(() => undefined),
        ),
      );
      if (!output.current?.querySelector("[data-a4-page]"))
        throw new Error("Wait for the paper pages to finish preparing.");
      window.print();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Printing is unavailable. Use Download PDF.",
      );
    } finally {
      setBusy(false);
    }
  };
  const pdf = async () => {
    setBusy(true);
    setError("");
    try {
      await exportQuizPdf(
        Array.from(output.current?.querySelectorAll<HTMLElement>("[data-a4-page]") ?? []),
        payload.details.title,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "PDF could not be prepared. Try Print.",
      );
    } finally {
      setBusy(false);
    }
  };
  const paper = (
    <QuizPaperPages payload={payload} institution={institution} answerKey={answerKey} />
  );
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[95dvh] max-h-[95dvh] w-[calc(100%-1rem)] flex-col overflow-hidden border-line bg-panel p-3 text-ink sm:max-w-4xl sm:p-5"
        >
          <DialogHeader className="pr-12 text-left">
            <DialogTitle>Question paper</DialogTitle>
            <DialogDescription className="text-base text-sub">
              Preview the A4 paper, print it, or download a PDF. Equations and images are
              included.
            </DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <Button
              className="absolute right-2 top-2 size-11"
              variant="ghost"
              aria-label="Close question paper"
            >
              <X className="size-5" />
            </Button>
          </DialogClose>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div className="col-span-2 min-w-0 space-y-1 sm:min-w-64 sm:flex-1">
              <Label htmlFor="paper-institution" className="text-base">
                Institution (optional)
              </Label>
              <Input
                id="paper-institution"
                maxLength={200}
                className="min-h-11 text-base"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
              />
            </div>
            <label className="col-span-2 flex min-h-11 cursor-pointer items-center gap-2 text-base">
              <Checkbox
                checked={answerKey}
                onCheckedChange={(checked) => setAnswerKey(checked === true)}
              />
              Include answer key
            </label>
            <Button
              className="min-h-11 text-base"
              disabled={busy}
              onClick={() => void print()}
            >
              <Printer className="size-5" />
              Print
            </Button>
            <Button
              className="min-h-11 text-base"
              disabled={busy}
              onClick={() => void pdf()}
            >
              {busy ? "Preparing…" : "Download PDF"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-base text-ruby">
              {error}
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-canvas p-2">
            {paper}
          </div>
        </DialogContent>
      </Dialog>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div ref={output} data-quiz-paper className="quiz-paper-output">
            <QuizPaperPages
              payload={payload}
              institution={institution}
              answerKey={answerKey}
              exportHost
            />
          </div>,
          document.body,
        )}
    </>
  );
}
