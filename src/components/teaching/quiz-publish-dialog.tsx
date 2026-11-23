"use client";

import { ChevronRight, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { issueLabel } from "@/lib/quizzes/publish-issues";
import type { QuizPublishBlocker } from "@/lib/validation/quiz-questions";

/** Each blocker is a button that takes the author to the thing to fix. */
export function PublishIssueList({
  issues,
  onSelect,
  labelledBy,
}: {
  issues: QuizPublishBlocker[];
  onSelect: (issue: QuizPublishBlocker) => void;
  labelledBy?: string;
}) {
  return (
    <ul aria-labelledby={labelledBy} className="space-y-1">
      {issues.map((issue, i) => (
        <li key={`${issue.path}-${i}`}>
          <button
            type="button"
            onClick={() => onSelect(issue)}
            className="group flex min-h-11 w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-base text-sub hover:bg-line/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-warning" />
            <span className="min-w-0 flex-1">{issueLabel(issue)}</span>
            <ChevronRight
              aria-hidden
              className="mt-0.5 size-5 shrink-0 text-faint group-hover:text-brand"
            />
          </button>
        </li>
      ))}
    </ul>
  );
}

export type PublishSummary = {
  questions: number;
  marks: number;
  time: string;
  quizType: "topic" | "course";
  republish: boolean;
};

/**
 * One dialog for both outcomes of tapping Publish: a list of things to fix (tap one to jump
 * to it), or, when the quiz is ready, a confirmation that says what will happen.
 */
export function QuizPublishDialog({
  open,
  onOpenChange,
  issues,
  summary,
  pending,
  onGoToIssue,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issues: QuizPublishBlocker[];
  summary: PublishSummary;
  pending: boolean;
  onGoToIssue: (issue: QuizPublishBlocker) => void;
  onConfirm: () => void;
}) {
  const blocked = issues.length > 0;
  const verb = summary.republish ? "Republish" : "Publish";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto border-line bg-panel text-ink sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle
            className="text-lg"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            {blocked
              ? `Fix ${issues.length} ${issues.length === 1 ? "thing" : "things"} first`
              : `${verb} this quiz?`}
          </DialogTitle>
          <DialogDescription className="text-base text-sub">
            {blocked
              ? "Tap an item to jump straight to it."
              : "Students can start attempts during the quiz’s availability window."}
          </DialogDescription>
        </DialogHeader>

        {blocked ? (
          <div className="max-h-[50dvh] overflow-y-auto">
            <PublishIssueList issues={issues} onSelect={onGoToIssue} />
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-3 gap-2 rounded-xl border border-line bg-canvas p-3 text-center">
              {[
                ["Questions", summary.questions],
                ["Marks", summary.marks],
                ["Time", summary.time],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dd
                    className="text-lg font-bold tabular-nums"
                    style={{ fontFamily: "var(--font-fraunces), serif" }}
                  >
                    {value}
                  </dd>
                  <dt className="text-sm uppercase tracking-wider text-faint">{label}</dt>
                </div>
              ))}
            </dl>
            <ul className="space-y-2 text-base text-sub">
              <li className="flex items-start gap-2">
                <ShieldCheck
                  aria-hidden
                  className="mt-0.5 size-5 shrink-0 text-success"
                />
                Scores stay hidden from students until an Admin releases them.
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck
                  aria-hidden
                  className="mt-0.5 size-5 shrink-0 text-success"
                />
                Questions and settings lock when published. Once an attempt starts, they stay locked even after unpublishing.
              </li>
              {summary.quizType === "course" && (
                <li className="flex items-start gap-2">
                  <ShieldCheck
                    aria-hidden
                    className="mt-0.5 size-5 shrink-0 text-success"
                  />
                  Released course quiz scores count toward CGPA or Post-UTME.
                </li>
              )}
            </ul>
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onOpenChange(false)}
          >
            {blocked ? "Close" : "Cancel"}
          </Button>
          {!blocked && (
            <Button
              type="button"
              className="min-h-11"
              disabled={pending}
              onClick={onConfirm}
            >
              {pending ? `${verb.replace(/e$/, "")}ing…` : `${verb} quiz`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
