"use client";
import {
  AlignLeft,
  BookOpen,
  ChevronRight,
  ListChecks,
  Pencil,
  ToggleLeft,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BankQuestionKind } from "@/lib/validation/question-bank";

export const BANK_TYPE_LABELS: Record<BankQuestionKind, string> = {
  true_false: "True or False",
  options: "Multiple choice",
  fill_in_gap: "Fill in the gap",
  passage: "Passage",
  essay: "Essay",
};
const choices: { kind: BankQuestionKind; icon: LucideIcon; description: string }[] = [
  {
    kind: "true_false",
    icon: ToggleLeft,
    description: "A statement the student marks as either true or false.",
  },
  {
    kind: "options",
    icon: ListChecks,
    description: "One question with two or more options. Exactly one is marked correct.",
  },
  {
    kind: "fill_in_gap",
    icon: AlignLeft,
    description:
      "A sentence with one or more blanks. Graded on an exact, case-insensitive match.",
  },
  {
    kind: "passage",
    icon: BookOpen,
    description: "A shared passage or text with several questions written beneath it.",
  },
  {
    kind: "essay",
    icon: Pencil,
    description: "A written, free-form answer. You read it and award the marks yourself.",
  },
];
export function BankTypeDialog({
  open,
  onOpenChange,
  onChoose,
  allowPassage = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (kind: BankQuestionKind) => void;
  allowPassage?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="bottom-0 left-0 right-0 top-auto flex max-h-[calc(100dvh-1rem)] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-b-none rounded-t-2xl border border-line bg-panel p-0 text-ink sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:max-h-[85dvh] sm:w-[calc(100%-3rem)] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
      >
        <DialogHeader className="shrink-0 gap-2 border-b border-line px-4 py-5 pr-16 text-left sm:px-6 sm:pr-20">
          <DialogTitle className="text-xl font-semibold tracking-tight sm:text-2xl">
            Choose question type
          </DialogTitle>
          <DialogDescription className="text-base leading-relaxed text-sub">
            How should the student answer? Add text, images and science equations next.
          </DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            className="absolute right-3 top-3 size-11 text-sub"
            aria-label="Close question type dialog"
          >
            <X className="size-5" />
          </Button>
        </DialogClose>
        <div className="grid min-h-0 auto-rows-max gap-2 overflow-y-auto overscroll-contain px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:grid-cols-2 sm:gap-3 sm:p-6">
          {choices
            .filter((choice) => allowPassage || choice.kind !== "passage")
            .map(({ kind, icon: Icon, description }) => (
              <Button
                key={kind}
                type="button"
                variant="outline"
                aria-label={BANK_TYPE_LABELS[kind]}
                className={`group h-auto min-h-24 items-start justify-start gap-3 whitespace-normal rounded-xl border-line bg-canvas p-3 text-left text-ink hover:border-brand hover:bg-brand/5 focus-visible:ring-brand sm:min-h-36 sm:p-4 ${kind === "essay" ? "sm:col-span-2 sm:min-h-24" : ""}`}
                onClick={() => {
                  onOpenChange(false);
                  onChoose(kind);
                }}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold">
                      {BANK_TYPE_LABELS[kind]}
                    </span>
                    {kind === "essay" && (
                      <Badge variant="secondary" className="bg-success/10 text-ink">
                        Manually graded
                      </Badge>
                    )}
                  </span>
                  <span className="block text-base font-normal leading-relaxed text-sub">
                    {description}
                  </span>
                </span>
                <ChevronRight
                  className="mt-3 size-4 shrink-0 text-sub"
                  aria-hidden="true"
                />
              </Button>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
