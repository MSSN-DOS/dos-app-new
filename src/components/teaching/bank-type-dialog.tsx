"use client";
import { AlignLeft, BookOpen, ListChecks, Pencil, ToggleLeft, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BankQuestionKind } from "@/lib/validation/question-bank";

export const BANK_TYPE_LABELS: Record<BankQuestionKind, string> = { true_false: "True or False", options: "Multiple choice", fill_in_gap: "Fill in the gap", passage: "Passage", essay: "Essay" };
const choices: { kind: BankQuestionKind; icon: LucideIcon; description: string }[] = [
  { kind: "true_false", icon: ToggleLeft, description: "A statement the student marks as either true or false." },
  { kind: "options", icon: ListChecks, description: "One question with two or more options. Exactly one is marked correct." },
  { kind: "fill_in_gap", icon: AlignLeft, description: "A sentence with one or more blanks. Graded on an exact, case-insensitive match." },
  { kind: "passage", icon: BookOpen, description: "A shared passage or text with several questions written beneath it." },
  { kind: "essay", icon: Pencil, description: "A written, free-form answer. You read it and award the marks yourself." },
];
export function BankTypeDialog({ open, onOpenChange, onChoose, allowPassage = true }: { open: boolean; onOpenChange: (open: boolean) => void; onChoose: (kind: BankQuestionKind) => void; allowPassage?: boolean }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl border border-line bg-panel p-5 text-ink sm:max-w-3xl sm:p-7">
      <DialogHeader className="gap-2 pr-9 text-left">
        <DialogTitle className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Choose question type</DialogTitle>
        <DialogDescription className="text-base leading-relaxed text-sub">How should the student answer? This is fixed once the question is saved.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {choices.filter(choice => allowPassage || choice.kind !== "passage").map(({ kind, icon: Icon, description }) => <Button key={kind} type="button" variant="outline" aria-label={BANK_TYPE_LABELS[kind]} className={`group h-auto min-h-40 flex-col items-start justify-start gap-3 whitespace-normal rounded-2xl border-brand/60 bg-canvas p-4 text-left text-ink hover:border-brand hover:bg-brand/5 focus-visible:ring-brand sm:p-5 ${kind === "essay" ? "sm:col-span-2" : ""}`} onClick={() => { onOpenChange(false); onChoose(kind); }}>
          <span className="flex w-full items-start justify-between gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><Icon className="size-5" aria-hidden="true" /></span>
            {kind === "essay" && <Badge className="bg-success/10 text-ink">Manually graded</Badge>}
          </span>
          <span className="block text-lg font-semibold">{BANK_TYPE_LABELS[kind]}</span>
          <span className="block text-base font-normal leading-relaxed text-sub">{description}</span>
        </Button>)}
      </div>
    </DialogContent>
  </Dialog>;
}
