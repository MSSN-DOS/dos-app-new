"use client";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import { parseQuizBulk, quizBulkSchema } from "@/lib/validation/quiz-bulk";
import type { BuilderQuestion } from "@/lib/quizzes/builder";
import type { z } from "zod";
const descriptions = {
  fill_in_gap: "Question with [gap] → answer for each gap",
  options: "Question → option A → *correct option → option C",
  multi_answer: "Question → *correct option → incorrect option → *correct option",
  numeric: "Question → numeric answer → tolerance (optional) → unit (optional)",
  true_false: "Statement → True or False",
  essay: "One question per line; manually graded",
};
export function QuizBulkDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (questions: BuilderQuestion[]) => void;
}) {
  const [type, setType] = useState<z.infer<typeof quizBulkSchema>["type"]>("fill_in_gap");
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const result = parseQuizBulk({ type, text });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="bottom-0 left-0 right-0 top-auto max-h-[95dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-b-none rounded-t-2xl border-line bg-panel p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-ink sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
      >
        <DialogHeader className="pr-12 text-left">
          <DialogTitle>Bulk paste questions</DialogTitle>
          <DialogDescription className="text-base text-sub">
            One question per line. Separate columns with a Tab; use Insert separator on
            your phone.
          </DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
          <Button
            variant="ghost"
            className="absolute right-2 top-2 size-11"
            aria-label="Close bulk paste"
          >
            <X className="size-5" />
          </Button>
        </DialogClose>
        <Label htmlFor="bulk-type" className="text-base">
          Question type
        </Label>
        <Select
          value={type}
          onValueChange={(value) => setType(quizBulkSchema.shape.type.parse(value))}
        >
          <SelectTrigger id="bulk-type" className="min-h-11 w-full text-base">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="[&_[role=option]]:min-h-11 [&_[role=option]]:text-base">
            {Object.keys(descriptions).map((key) => (
              <SelectItem key={key} value={key}>
                {
                  {
                    fill_in_gap: "Fill in the gap",
                    options: "Multiple choice",
                    multi_answer: "Multi-answer",
                    numeric: "Numeric",
                    true_false: "True / False",
                    essay: "Essay",
                  }[quizBulkSchema.shape.type.parse(key)]
                }
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="break-words text-base text-sub">{descriptions[type]}</p>
        <Label htmlFor="bulk-text" className="text-base">
          Questions
        </Label>
        <Textarea
          ref={input}
          id="bulk-text"
          rows={8}
          maxLength={100000}
          value={text}
          className="min-h-48 text-base font-mono"
          onChange={(e) => setText(e.target.value)}
        />
        {text.trim() && result.errors.length > 0 && (
          <ul
            role="alert"
            className="max-h-36 list-disc overflow-y-auto pl-5 text-base text-ruby"
          >
            {result.errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        )}
        <p role="status" className="text-base text-sub">
          {result.questions.length} questions ready to add
        </p>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="min-h-11 text-base"
            onClick={() => {
              const field = input.current;
              if (field) {
                const start = field.selectionStart;
                setText(text.slice(0, start) + "\t" + text.slice(field.selectionEnd));
                field.focus();
                requestAnimationFrame(() =>
                  field.setSelectionRange(start + 1, start + 1),
                );
              }
            }}
          >
            Insert separator
          </Button>
          <Button
            className="min-h-11 text-base"
            disabled={!result.questions.length}
            onClick={() => {
              onAdd(
                result.questions.map((q) => ({ ...q, clientKey: crypto.randomUUID() })),
              );
              setText("");
              onOpenChange(false);
            }}
          >
            Add {result.questions.length} questions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
