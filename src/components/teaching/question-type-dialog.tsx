"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { QuestionPreset } from "@/lib/quizzes/builder";

const types: { value: QuestionPreset | "passage"; label: string; description: string }[] =
  [
    {
      value: "true_false",
      label: "True / False",
      description: "Choose one of two answers.",
    },
    {
      value: "options",
      label: "Multiple choice",
      description: "Two or more options with one correct answer.",
    },
    {
      value: "fill_in_gap",
      label: "Fill in the gap",
      description: "Use [gap] markers and exact-match answers.",
    },
    {
      value: "passage",
      label: "Passage",
      description: "Shared text with several sub-questions.",
    },
    {
      value: "essay",
      label: "Essay",
      description: "A written response marked by the teacher.",
    },
  ];

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-line bg-panel text-ink sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Choose question type</DialogTitle>
          <DialogDescription className="text-sub">
            Craft questions with rich science symbols and equations.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {types
            .filter((t) => allowPassage || t.value !== "passage")
            .map((t) => (
              <Button
                key={t.value}
                type="button"
                variant="outline"
                className="h-auto min-h-28 justify-start whitespace-normal rounded-xl border-line bg-canvas p-4 text-left text-ink hover:bg-line"
                onClick={() => {
                  onChoose(t.value);
                  onOpenChange(false);
                }}
              >
                <span className="space-y-2">
                  <span className="block text-base font-semibold">{t.label}</span>
                  {t.value === "essay" && (
                    <Badge variant="secondary">Manually graded</Badge>
                  )}
                  <span className="block text-base font-normal text-sub">
                    {t.description}
                  </span>
                </span>
              </Button>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
