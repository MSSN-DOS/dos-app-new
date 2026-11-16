"use client";

import type { QuestionPreset } from "@/lib/quizzes/builder";
import { BankTypeDialog } from "./bank-type-dialog";

export function QuestionTypeDialog({
  open,
  onOpenChange,
  onChoose,
  allowPassage = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (type: QuestionPreset | "passage") => void;
  allowPassage?: boolean;
}) {
  return (
    <BankTypeDialog
      open={open}
      onOpenChange={onOpenChange}
      onChoose={onChoose}
      allowPassage={allowPassage}
    />
  );
}
