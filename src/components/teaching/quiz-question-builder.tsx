"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { renderRichText } from "@/lib/rich-text";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  builderBlocks,
  duplicateBuilderQuestion,
  newBuilderQuestion,
  questionTypeLabel,
  reorderByKey,
  type BuilderPassage,
  type BuilderQuestion,
  type QuestionPreset,
} from "@/lib/quizzes/builder";
import { distributeMarks, sumMarks } from "@/lib/quizzes/marks";
import type { QuizPublishBlocker } from "@/lib/validation/quiz-questions";
import { QuestionTypeDialog } from "./question-type-dialog";
import { RichTextEditor, type QuizImageUploader } from "./rich-text-editor";
import { RichTextToolbarProvider, RichTextToolbarHost } from "./rich-text-toolbar";

const actionClass = "min-h-11 min-w-11 text-ink";

function SortableRows({
  keys,
  onReorder,
  children,
}: {
  keys: string[];
  onReorder: (active: string, over: string) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (over) onReorder(String(active.id), String(over.id));
      }}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Press Space to pick up. Use the arrow keys to move. Press Space to drop or Escape to cancel. Move up and down buttons are also available.",
        },
      }}
    >
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

function SortableFrame({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-20 opacity-80" : "min-w-0"}
    >
      {children(
        <Button
          ref={setActivatorNodeRef}
          type="button"
          variant="ghost"
          className={`${actionClass} touch-none cursor-grab`}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${label}`}
        >
          <GripVertical className="size-5" />
        </Button>,
      )}
    </div>
  );
}

function QuestionCard({
  question,
  number,
  handle,
  selected,
  onSelect,
  onChange,
  onDuplicate,
  onDelete,
  onMove,
  canMoveUp,
  canMoveDown,
  errors,
  uploadImage,
  expanded,
  onExpandedChange,
  readOnly,
}: {
  question: BuilderQuestion;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  readOnly: boolean;
  number: number;
  handle: ReactNode;
  selected: boolean;
  onSelect: () => void;
  onChange: (q: BuilderQuestion) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  errors: QuizPublishBlocker[];
  uploadImage?: QuizImageUploader;
}) {
  const open = expanded;
  const [more, setMore] = useState(false);
  const q = question;
  const prefix = `question-${q.clientKey}`;
  const update = (patch: Partial<BuilderQuestion>) => onChange({ ...q, ...patch });
  const fieldErrors = (field: string) =>
    errors
      .filter((e) => e.path.split(".")[2] === field)
      .map((e) => (
        <p key={`${e.path}-${e.message}`} role="alert" className="text-base text-ruby">
          {e.message}
        </p>
      ));
  const typeLabel = questionTypeLabel(q);
  return (
    <Collapsible
      open={open}
      onOpenChange={onExpandedChange}
      id={prefix}
      className={
        "overflow-hidden rounded-xl border bg-panel " +
        (open ? "border-brand/40" : "border-line")
      }
    >
      <div className="flex min-w-0 items-start gap-1 p-2 sm:p-3">
        {!readOnly && handle}
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-11 min-w-0 flex-1 items-start justify-start gap-2 whitespace-normal px-1 py-2 text-left"
            aria-label={(open ? "Collapse" : "Expand") + " question " + number}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-ink text-sm font-semibold tabular-nums text-canvas">
              {number}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="dos-rich-text block max-h-[3.2em] overflow-hidden break-words text-base font-medium [&_img]:max-h-24"
                dangerouslySetInnerHTML={{
                  __html:
                    renderRichText(q.bodyRichText.replaceAll("[gap]", "_____")) ||
                    "Untitled question",
                }}
              />
              <span className="mt-1 block text-sm font-normal text-sub sm:hidden">
                {typeLabel} · {q.marks}pt
              </span>
            </span>
            {errors.length > 0 && (
              <span
                aria-label="Needs review"
                className="mt-2 size-2 shrink-0 rounded-full bg-warning"
              />
            )}
            <Badge
              variant="secondary"
              className="hidden shrink-0 text-sub sm:inline-flex"
            >
              {typeLabel} · {q.marks}pt
            </Badge>
          </Button>
        </CollapsibleTrigger>
        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            className={actionClass}
            aria-label={`Duplicate question ${number}`}
            onClick={onDuplicate}
          >
            <Copy className="size-4" />
          </Button>
        )}
      </div>
      <CollapsibleContent>
        <RichTextToolbarProvider initialEditorId={`${prefix}-body`}>
          <fieldset disabled={readOnly} className="space-y-4 p-3 sm:p-5">
            <Tabs
              value={typeLabel === "True / False" ? "true_false" : q.questionType}
              onValueChange={(type) => {
                if (
                  type === "options" ||
                  type === "multi_answer" ||
                  type === "numeric" ||
                  type === "fill_in_gap" ||
                  type === "true_false" ||
                  type === "essay"
                ) {
                  const next = newBuilderQuestion(
                    type,
                    q.clientKey,
                    q.passageKey ?? null,
                  );
                  update({
                    ...next,
                    id: q.id,
                    bodyRichText: q.bodyRichText,
                    marks: q.marks,
                    reasonRichText: q.reasonRichText,
                  });
                }
              }}
            >
              <TabsList
                aria-label={`Question ${number} type`}
                className="flex min-h-12 w-full min-w-0 [&_button]:flex-1"
              >
                {(
                  [
                    "options",
                    "multi_answer",
                    "fill_in_gap",
                    "numeric",
                    "true_false",
                    "essay",
                  ] as const
                ).map((type) => (
                  <TabsTrigger
                    key={type}
                    value={type}
                    aria-label={
                      {
                        options: "Choice",
                        multi_answer: "Multi-answer",
                        fill_in_gap: "Gap",
                        numeric: "Number",
                        true_false: "True / False",
                        essay: "Essay",
                      }[type]
                    }
                    className="min-h-11 min-w-0 px-1 text-base"
                  >
                    <span
                      className={
                        (type === "true_false" && typeLabel === "True / False") ||
                        type === q.questionType
                          ? ""
                          : "sr-only sm:not-sr-only"
                      }
                    >
                      {
                        {
                          options: "Choice",
                          multi_answer: "Multi",
                          fill_in_gap: "Gap",
                          numeric: "Number",
                          true_false: "T/F",
                          essay: "Essay",
                        }[type]
                      }
                    </span>
                    <span
                      aria-hidden="true"
                      className={
                        (type === "true_false" && typeLabel === "True / False") ||
                        type === q.questionType
                          ? "hidden"
                          : "sm:hidden"
                      }
                    >
                      {
                        {
                          options: "A",
                          multi_answer: "✓",
                          fill_in_gap: "[ ]",
                          numeric: "#",
                          true_false: "T/F",
                          essay: "E",
                        }[type]
                      }
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <RichTextToolbarHost />
            <RichTextEditor
              id={`${prefix}-body`}
              label="Question"
              value={q.bodyRichText}
              gapAnswers={
                q.questionType === "fill_in_gap"
                  ? (q.blanks ?? []).map((b) => b.acceptedAnswer)
                  : undefined
              }
              clickToEdit={false}
              readOnly={readOnly}
              onChange={(bodyRichText, answers) =>
                update({
                  bodyRichText,
                  ...(answers
                    ? { blanks: answers.map((acceptedAnswer) => ({ acceptedAnswer })) }
                    : {}),
                })
              }
              uploadImage={uploadImage}
            />
            {fieldErrors("bodyRichText")}
            {(q.questionType === "options" || q.questionType === "multi_answer") && (
              <fieldset className="space-y-3">
                <legend className="mb-2 text-base font-semibold text-ink">
                  {q.questionType === "multi_answer"
                    ? "Options — select all correct answers"
                    : "Options — select one correct answer"}
                </legend>
                <RadioGroup
                  role={q.questionType === "multi_answer" ? "group" : "radiogroup"}
                  aria-label={`Correct answers for question ${number}`}
                  value={String(q.options?.findIndex((option) => option.isCorrect) ?? -1)}
                  onValueChange={(selected) => {
                    if (q.questionType === "options")
                      update({
                        options: q.options?.map((option, index) => ({
                          ...option,
                          isCorrect: index === Number(selected),
                        })),
                      });
                  }}
                >
                  {(q.options ?? []).map((option, index) => (
                    <div
                      key={index}
                      className="space-y-2 rounded-xl border border-line bg-canvas p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-base font-semibold text-ink">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-base text-ink">
                          <span className="flex size-11 items-center justify-center">
                            {q.questionType === "multi_answer" ? (
                              <Checkbox
                                checked={option.isCorrect}
                                aria-label={`Select option ${String.fromCharCode(65 + index)} as answer for question ${number}`}
                                onCheckedChange={(checked) =>
                                  update({
                                    options: q.options?.map((o, i) => ({
                                      ...o,
                                      isCorrect:
                                        i === index ? checked === true : o.isCorrect,
                                    })),
                                  })
                                }
                              />
                            ) : (
                              <RadioGroupItem
                                value={String(index)}
                                aria-label={`Select option ${String.fromCharCode(65 + index)} as answer for question ${number}`}
                              />
                            )}
                          </span>
                          Select as answer
                        </label>
                        {typeLabel !== "True / False" && (q.options?.length ?? 0) > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            className={`${actionClass} text-ruby`}
                            aria-label={`Remove option ${String.fromCharCode(65 + index)} from question ${number}`}
                            onClick={() =>
                              update({
                                options: q.options?.filter((_, i) => i !== index),
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                      {typeLabel === "True / False" ? (
                        <p className="text-base text-ink">
                          {index === 0 ? "True" : "False"}
                        </p>
                      ) : (
                        <RichTextEditor
                          id={`${prefix}-option-${index}`}
                          label={`Option ${String.fromCharCode(65 + index)}`}
                          value={option.optionText}
                          readOnly={readOnly}
                          onChange={(optionText) =>
                            update({
                              options: q.options?.map((o, i) =>
                                i === index ? { ...o, optionText } : o,
                              ),
                            })
                          }
                          uploadImage={uploadImage}
                        />
                      )}
                    </div>
                  ))}
                </RadioGroup>
                {typeLabel !== "True / False" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full border-dashed border-line text-ink"
                    onClick={() =>
                      update({
                        options: [
                          ...(q.options ?? []),
                          { optionText: "", isCorrect: false },
                        ],
                      })
                    }
                  >
                    <Plus className="size-4" />
                    Add more option
                  </Button>
                )}
                {fieldErrors("options")}
              </fieldset>
            )}
            {q.questionType === "fill_in_gap" && (
              <p className="hidden text-sm text-sub md:block">
                Use [ ] to insert a gap and enter its accepted answer in the sentence.
                Answers ignore case and surrounding spaces; every gap must match.
              </p>
            )}
            {q.questionType === "numeric" && (
              <fieldset className="grid min-w-0 gap-3 sm:grid-cols-3">
                <legend className="mb-2 text-base font-semibold">Numeric grading</legend>
                <div className="space-y-1">
                  <Label htmlFor={`${prefix}-numeric`} className="text-base">
                    Correct answer
                  </Label>
                  <Input
                    id={`${prefix}-numeric`}
                    type="number"
                    step="any"
                    className="min-h-11 text-base"
                    value={q.numericAnswer ?? ""}
                    onChange={(e) =>
                      update({
                        numericAnswer:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                  {fieldErrors("numericAnswer")}
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${prefix}-tolerance`} className="text-base">
                    Absolute tolerance
                  </Label>
                  <Input
                    id={`${prefix}-tolerance`}
                    type="number"
                    min={0}
                    step="any"
                    className="min-h-11 text-base"
                    value={q.numericTolerance}
                    onChange={(e) => update({ numericTolerance: Number(e.target.value) })}
                  />
                  {fieldErrors("numericTolerance")}
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${prefix}-unit`} className="text-base">
                    Unit label (optional)
                  </Label>
                  <Input
                    id={`${prefix}-unit`}
                    maxLength={60}
                    className="min-h-11 text-base"
                    placeholder="e.g. m/s"
                    value={q.numericUnit}
                    onChange={(e) => update({ numericUnit: e.target.value })}
                  />
                </div>
                <p className="text-base text-sub sm:col-span-3">
                  Answers within ±{q.numericTolerance} of the correct number earn full
                  marks. Units are displayed, not converted.
                </p>
              </fieldset>
            )}
            {q.questionType === "essay" && (
              <p className="text-base text-sub">
                The teacher awards marks after submission. Results stay pending until
                grading is complete and an Admin releases them.
              </p>
            )}
            <div className="flex items-center justify-between border-t border-line pt-2">
              <Button
                type="button"
                variant="ghost"
                className={actionClass + " text-ruby"}
                aria-label={`Delete question ${number}`}
                onClick={onDelete}
              >
                <Trash2 className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 text-base"
                aria-expanded={more}
                onClick={() => setMore(!more)}
              >
                More <ChevronDown className={more ? "size-4 rotate-180" : "size-4"} />
              </Button>
            </div>
            {more && (
              <div className="space-y-4 rounded-xl border border-line bg-canvas p-3">
                {(q.questionType === "options" || q.questionType === "multi_answer") && (
                  <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-base">
                    <span>Shuffle options for this question</span>
                    <span className="flex size-11 items-center justify-center">
                      <Switch
                        checked={q.shuffleOptions}
                        onCheckedChange={(shuffleOptions) => update({ shuffleOptions })}
                        aria-label={`Shuffle options for question ${number}`}
                      />
                    </span>
                  </label>
                )}
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-base">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={onSelect}
                    aria-label={"Select question " + number}
                  />
                  Select for bulk delete
                </label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="min-h-11 text-base">
                      Change position
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="[&_[role=menuitem]]:min-h-11 [&_[role=menuitem]]:text-base">
                    <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMove(-1)}>
                      Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMove(1)}>
                      Move down
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <RichTextEditor
                  id={`${prefix}-reason`}
                  label="Reason / explanation (optional)"
                  value={q.reasonRichText ?? ""}
                  readOnly={readOnly}
                  onChange={(reasonRichText) => update({ reasonRichText })}
                  uploadImage={uploadImage}
                />
                <p className="text-base text-sub">
                  Shown after the attempt when answers are revealed.
                </p>
                <div className="max-w-40 space-y-1">
                  <Label htmlFor={`${prefix}-marks`} className="text-base">
                    Marks
                  </Label>
                  <Input
                    id={`${prefix}-marks`}
                    type="number"
                    min={0}
                    max={1000}
                    step={1}
                    className="min-h-11 text-base"
                    value={Number.isNaN(q.marks) ? "" : q.marks}
                    onChange={(e) =>
                      update({
                        marks: e.target.value === "" ? 0 : Number(e.target.value),
                      })
                    }
                    aria-invalid={errors.some((e) => e.path.endsWith(".marks"))}
                  />
                  {fieldErrors("marks")}
                </div>
              </div>
            )}
          </fieldset>
        </RichTextToolbarProvider>
      </CollapsibleContent>
      {!open && errors.length > 0 && (
        <p role="alert" className="p-3 text-base text-ruby">
          {errors.length} publishing issue{errors.length === 1 ? "" : "s"}. Expand to
          review.
        </p>
      )}
    </Collapsible>
  );
}

export function QuizQuestionBuilder({
  questions,
  passages,
  onChange,
  errors = [],
  uploadImage,
  collapseSavedQuestions = false,
  onOpenBank,
  onOpenBulk,
  readOnly = false,
}: {
  questions: BuilderQuestion[];
  collapseSavedQuestions?: boolean;
  readOnly?: boolean;
  passages: BuilderPassage[];
  onChange: (questions: BuilderQuestion[], passages: BuilderPassage[]) => void;
  errors?: QuizPublishBlocker[];
  uploadImage?: QuizImageUploader;
  onOpenBank?: () => void;
  onOpenBulk?: () => void;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(
    collapseSavedQuestions ? null : (questions[0]?.clientKey ?? null),
  );
  const [chooser, setChooser] = useState<{ passageKey: string | null } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<{
    questionKeys: string[];
    passageKey?: string;
  } | null>(null);
  const [total, setTotal] = useState("");
  const [marksError, setMarksError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const blocks = builderBlocks(questions, passages);
  const flat = blocks.flatMap((b) => b.questions);
  const changeQuestions = (next: BuilderQuestion[]) =>
    onChange(
      builderBlocks(next, passages).flatMap((block) => block.questions),
      passages,
    );
  const choose = (type: QuestionPreset | "passage") => {
    if (type === "passage") {
      const key = crypto.randomUUID();
      onChange(
        [
          ...questions,
          newBuilderQuestion("options", crypto.randomUUID(), key),
          newBuilderQuestion("options", crypto.randomUUID(), key),
        ],
        [...passages, { clientKey: key, title: "", bodyRichText: "" }],
      );
    } else {
      const key = crypto.randomUUID();
      setExpandedKey(key);
      changeQuestions([
        ...questions,
        newBuilderQuestion(type, key, chooser?.passageKey ?? null),
      ]);
      requestAnimationFrame(() =>
        document
          .getElementById(`question-${key}`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" }),
      );
    }
  };
  const reorderBlocks = (active: string, over: string) => {
    const next = reorderByKey(blocks, active, over);
    onChange(
      next.flatMap((b) => b.questions),
      next.flatMap((b) => (b.passage ? [b.passage] : [])),
    );
    setAnnouncement(
      `Moved item to position ${next.findIndex((b) => b.key === active) + 1}.`,
    );
  };
  const reorderSub = (key: string, active: string, over: string) => {
    const next = blocks.map((b) =>
      b.key === key
        ? {
            ...b,
            questions: reorderByKey(
              b.questions.map((q) => ({ key: q.clientKey, q })),
              active,
              over,
            ).map((r) => r.q),
          }
        : b,
    );
    changeQuestions(next.flatMap((b) => b.questions));
    setAnnouncement("Sub-question order updated.");
  };
  const renderCard = (
    q: BuilderQuestion,
    handle: ReactNode,
    index: number,
    siblingKeys: string[],
    reorder: (active: string, over: string) => void,
  ) => (
    <QuestionCard
      question={q}
      expanded={expandedKey === q.clientKey}
      onExpandedChange={(open) => setExpandedKey(open ? q.clientKey : null)}
      readOnly={readOnly}
      number={flat.findIndex((s) => s.clientKey === q.clientKey) + 1}
      handle={handle}
      selected={selected.includes(q.clientKey)}
      onSelect={() =>
        setSelected((prev) =>
          prev.includes(q.clientKey)
            ? prev.filter((key) => key !== q.clientKey)
            : [...prev, q.clientKey],
        )
      }
      onChange={(next) =>
        changeQuestions(questions.map((s) => (s.clientKey === q.clientKey ? next : s)))
      }
      onDuplicate={() => {
        const position = questions.findIndex((s) => s.clientKey === q.clientKey);
        const key = crypto.randomUUID();
        setExpandedKey(key);
        changeQuestions([
          ...questions.slice(0, position + 1),
          duplicateBuilderQuestion(q, key),
          ...questions.slice(position + 1),
        ]);
      }}
      onDelete={() => setDeleting({ questionKeys: [q.clientKey] })}
      onMove={(direction) => {
        const target = siblingKeys[index + direction];
        if (target) reorder(q.clientKey, target);
      }}
      canMoveUp={index > 0}
      canMoveDown={index < siblingKeys.length - 1}
      errors={errors.filter((e) =>
        e.path.startsWith(
          `questions.${questions.findIndex((s) => s.clientKey === q.clientKey)}.`,
        ),
      )}
      uploadImage={uploadImage}
    />
  );

  return (
    <section className="min-w-0 space-y-4" aria-labelledby="question-builder-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="question-builder-heading" className="text-xl font-semibold text-ink">
          Questions <span className="text-sub">({questions.length})</span>
        </h2>
        <Button
          type="button"
          disabled={readOnly}
          className="min-h-11 bg-brand text-primary-foreground hover:bg-brand-hover"
          onClick={() => setChooser({ passageKey: null })}
        >
          <Plus className="size-4" />
          Add new question
        </Button>
      </div>
      <div className="space-y-2 rounded-xl border border-line bg-panel p-3 sm:p-4">
        <p className="text-base font-semibold text-ink">
          Total marks: {sumMarks(questions.map((q) => q.marks))}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40 space-y-1">
            <Label htmlFor="quiz-total-marks" className="text-base">
              Set total marks
            </Label>
            <Input
              id="quiz-total-marks"
              disabled={readOnly}
              type="number"
              min={questions.length || 1}
              step={1}
              className="min-h-11 text-base"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={readOnly}
            variant="outline"
            className="min-h-11 border-line text-ink"
            onClick={() => {
              const result = distributeMarks(Number(total), questions.length);
              if (!result.ok) {
                setMarksError(
                  result.reason === "no-questions"
                    ? "Add questions before distributing marks."
                    : result.reason === "total-below-count"
                      ? "Use at least one mark per question."
                      : "Enter a positive whole number.",
                );
                return;
              }
              if (result.marks.some((mark) => mark > 1000)) {
                setMarksError("Each question can have at most 1000 marks.");
                return;
              }
              setMarksError(null);
              changeQuestions(flat.map((q, i) => ({ ...q, marks: result.marks[i] })));
            }}
          >
            Apply
          </Button>
        </div>
        <p className="text-base text-sub">
          Apply distributes whole marks evenly across questions and their correct answers.
          Any remainder goes to the earliest questions. Each gap question is graded as a
          whole.
        </p>
        {marksError && (
          <p role="alert" className="text-base text-ruby">
            {marksError}
          </p>
        )}
      </div>
      {questions.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-base text-ink">
            <Checkbox
              disabled={readOnly}
              checked={questions.every((q) => selected.includes(q.clientKey))}
              onCheckedChange={(checked) =>
                setSelected(checked ? questions.map((q) => q.clientKey) : [])
              }
            />
            Select all
          </label>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 border-line text-ruby"
            disabled={
              readOnly ||
              !selected.some((key) => questions.some((q) => q.clientKey === key))
            }
            onClick={() => setDeleting({ questionKeys: selected })}
          >
            <Trash2 className="size-4" />
            Bulk delete ({selected.length})
          </Button>
        </div>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {blocks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-panel p-6 text-center">
          <h3 className="text-lg font-semibold text-ink">Your quiz starts here</h3>
          <p className="mt-2 text-base text-sub">
            Add a question, a passage, or a manually graded essay.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-11 border-line text-ink"
            onClick={() => setChooser({ passageKey: null })}
          >
            <Plus className="size-4" />
            Add your first question
          </Button>
        </div>
      ) : (
        <SortableRows keys={blocks.map((b) => b.key)} onReorder={reorderBlocks}>
          <div className="space-y-4">
            {blocks.map((block, blockIndex) => (
              <SortableFrame
                key={block.key}
                id={block.key}
                label={
                  block.passage
                    ? "passage"
                    : `question ${flat.findIndex((q) => q.clientKey === block.key) + 1}`
                }
              >
                {(handle) =>
                  block.passage ? (
                    <Collapsible
                      defaultOpen
                      className="space-y-3 rounded-2xl border border-line bg-canvas p-3 sm:p-5"
                    >
                      <div className="flex flex-wrap items-center gap-1">
                        {handle}
                        <Badge variant="secondary">Passage</Badge>
                        <div className="ml-auto flex">
                          <Button
                            type="button"
                            variant="ghost"
                            className={actionClass}
                            disabled={blockIndex === 0}
                            aria-label="Move passage up"
                            onClick={() =>
                              reorderBlocks(block.key, blocks[blockIndex - 1].key)
                            }
                          >
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className={actionClass}
                            disabled={blockIndex === blocks.length - 1}
                            aria-label="Move passage down"
                            onClick={() =>
                              reorderBlocks(block.key, blocks[blockIndex + 1].key)
                            }
                          >
                            <ArrowDown className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className={actionClass}
                            aria-label="Duplicate passage and sub-questions"
                            onClick={() => {
                              const key = crypto.randomUUID();
                              const copies = block.questions.map((q) => ({
                                ...duplicateBuilderQuestion(q, crypto.randomUUID()),
                                passageKey: key,
                              }));
                              const next = [
                                ...blocks.slice(0, blockIndex + 1),
                                {
                                  key,
                                  passage: {
                                    ...block.passage!,
                                    id: undefined,
                                    clientKey: key,
                                  },
                                  questions: copies,
                                },
                                ...blocks.slice(blockIndex + 1),
                              ];
                              onChange(
                                next.flatMap((b) => b.questions),
                                next.flatMap((b) => (b.passage ? [b.passage] : [])),
                              );
                            }}
                          >
                            <Copy className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className={`${actionClass} text-ruby`}
                            aria-label="Delete passage and sub-questions"
                            onClick={() =>
                              setDeleting({
                                passageKey: block.key,
                                questionKeys: block.questions.map((q) => q.clientKey),
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                          <CollapsibleTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              className={actionClass}
                              aria-label="Expand or collapse passage"
                            >
                              <ChevronDown className="size-5" />
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                      </div>
                      <CollapsibleContent className="space-y-4">
                        <div className="space-y-1">
                          <Label
                            htmlFor={`passage-${block.key}-title`}
                            className="text-base"
                          >
                            Passage title (optional)
                          </Label>
                          <Input
                            id={`passage-${block.key}-title`}
                            className="min-h-11 text-base"
                            value={block.passage.title}
                            onChange={(e) =>
                              onChange(
                                questions,
                                passages.map((p) =>
                                  p.clientKey === block.key
                                    ? { ...p, title: e.target.value }
                                    : p,
                                ),
                              )
                            }
                          />
                        </div>
                        <RichTextEditor
                          id={`passage-${block.key}-body`}
                          label="Shared passage"
                          value={block.passage.bodyRichText}
                          onChange={(bodyRichText) =>
                            onChange(
                              questions,
                              passages.map((p) =>
                                p.clientKey === block.key ? { ...p, bodyRichText } : p,
                              ),
                            )
                          }
                          uploadImage={uploadImage}
                        />
                        {errors
                          .filter((e) =>
                            e.path.startsWith(
                              `passages.${passages.findIndex((p) => p.clientKey === block.key)}`,
                            ),
                          )
                          .map((e) => (
                            <p key={e.path} role="alert" className="text-base text-ruby">
                              {e.message}
                            </p>
                          ))}
                        <SortableRows
                          keys={block.questions.map((q) => q.clientKey)}
                          onReorder={(a, b) => reorderSub(block.key, a, b)}
                        >
                          <div className="space-y-3">
                            {block.questions.map((q, i) => (
                              <SortableFrame
                                key={q.clientKey}
                                id={q.clientKey}
                                label={`sub-question ${i + 1}`}
                              >
                                {(subHandle) =>
                                  renderCard(
                                    q,
                                    subHandle,
                                    i,
                                    block.questions.map((s) => s.clientKey),
                                    (a, b) => reorderSub(block.key, a, b),
                                  )
                                }
                              </SortableFrame>
                            ))}
                          </div>
                        </SortableRows>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11 border-line text-ink"
                          onClick={() => setChooser({ passageKey: block.key })}
                        >
                          <Plus className="size-4" />
                          Add sub-question
                        </Button>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : (
                    renderCard(
                      block.questions[0],
                      handle,
                      blockIndex,
                      blocks.map((b) => b.key),
                      reorderBlocks,
                    )
                  )
                }
              </SortableFrame>
            ))}
          </div>
        </SortableRows>
      )}
      {!readOnly && (
        <div className="fixed bottom-[calc(11rem+env(safe-area-inset-bottom))] right-4 z-30 flex justify-end lg:bottom-24 lg:right-[max(1rem,calc((100vw-1080px)/2))]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                className="size-13 gap-2 rounded-full p-0 text-base md:w-auto md:px-5"
                aria-label="Add question"
              >
                <Plus className="size-5" />
                <span className="hidden md:inline">Add question</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="center"
              className="max-h-[55dvh] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto border-line bg-panel text-ink [&_[role=menuitem]]:min-h-11 [&_[role=menuitem]]:text-base"
            >
              <DropdownMenuLabel>New question</DropdownMenuLabel>
              {(
                [
                  "true_false",
                  "options",
                  "multi_answer",
                  "fill_in_gap",
                  "numeric",
                  "passage",
                  "essay",
                ] as const
              ).map((type) => (
                <DropdownMenuItem
                  key={type}
                  onSelect={() => {
                    setChooser(null);
                    choose(type);
                  }}
                >
                  {
                    {
                      true_false: "True / False",
                      options: "Multiple choice",
                      multi_answer: "Multi-answer",
                      fill_in_gap: "Fill in the gap",
                      numeric: "Numeric",
                      passage: "Passage",
                      essay: "Essay · manually graded",
                    }[type]
                  }
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setChooser({ passageKey: null })}>
                Choose question type…
              </DropdownMenuItem>
              {onOpenBank && (
                <DropdownMenuItem onSelect={onOpenBank}>
                  From question bank
                </DropdownMenuItem>
              )}
              {onOpenBulk && (
                <DropdownMenuItem onSelect={onOpenBulk}>
                  Bulk paste questions
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <QuestionTypeDialog
        open={chooser !== null}
        onOpenChange={(open) => {
          if (!open) setChooser(null);
        }}
        onChoose={choose}
        allowPassage={!chooser?.passageKey}
      />
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent className="border-line bg-panel text-ink">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting?.passageKey
                ? "Delete passage and its sub-questions?"
                : `Delete ${deleting?.questionKeys.length ?? 0} question(s)?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sub">
              This removes them from your current quiz. Save the quiz to persist the
              change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-ruby text-destructive-foreground hover:bg-ruby-hover"
              onClick={() => {
                if (!deleting) return;
                onChange(
                  questions.filter((q) => !deleting.questionKeys.includes(q.clientKey)),
                  passages.filter((p) => p.clientKey !== deleting.passageKey),
                );
                setSelected((prev) =>
                  prev.filter((key) => !deleting.questionKeys.includes(key)),
                );
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
