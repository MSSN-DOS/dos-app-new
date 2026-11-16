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
  collapsedInitially,
}: {
  question: BuilderQuestion;
  collapsedInitially: boolean;
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
  const [open, setOpen] = useState(!collapsedInitially);
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
      onOpenChange={setOpen}
      id={prefix}
      className={
        "overflow-hidden rounded-xl border bg-panel " +
        (open ? "border-brand/40" : "border-line")
      }
    >
      <div className="space-y-1 border-b border-line p-2 sm:p-3">
        <div className="flex min-w-0 items-start gap-1">
          {handle}
          <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
            <Checkbox
              checked={selected}
              onCheckedChange={onSelect}
              aria-label={"Select question " + number}
            />
          </label>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-auto min-h-11 min-w-0 flex-1 items-start justify-between gap-2 whitespace-normal px-2 py-2 text-left text-ink"
              aria-label={(open ? "Collapse" : "Expand") + " question " + number}
            >
              <span className="min-w-0 space-y-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{number}.</span>
                  <Badge variant="secondary" className="text-sub">
                    {typeLabel}
                  </Badge>
                  <span className="text-base font-normal text-sub">{q.marks} marks</span>
                </span>
                <span className="block line-clamp-2 break-words text-base font-medium">
                  {q.bodyRichText
                    .replace(/<[^>]*>/g, " ")
                    .replace(/&nbsp;/g, " ")
                    .trim() || "Untitled question"}
                </span>
              </span>
              <ChevronDown
                className={
                  "mt-1 size-5 shrink-0 transition-transform " +
                  (open ? "rotate-180" : "")
                }
              />
            </Button>
          </CollapsibleTrigger>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            className={actionClass}
            disabled={!canMoveUp}
            aria-label={`Move question ${number} up`}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={actionClass}
            disabled={!canMoveDown}
            aria-label={`Move question ${number} down`}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={actionClass}
            aria-label={`Duplicate question ${number}`}
            onClick={onDuplicate}
          >
            <Copy className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={`${actionClass} text-ruby`}
            aria-label={`Delete question ${number}`}
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <CollapsibleContent className="space-y-4 p-3 sm:p-5">
        <RichTextEditor
          id={`${prefix}-body`}
          label="Question"
          value={q.bodyRichText}
          onChange={(bodyRichText) => update({ bodyRichText })}
          uploadImage={uploadImage}
        />
        {fieldErrors("bodyRichText")}
        {q.questionType === "options" && (
          <fieldset className="space-y-3">
            <legend className="mb-2 text-base font-semibold text-ink">
              Options — select one correct answer
            </legend>
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
                    <Checkbox
                      checked={option.isCorrect}
                      onCheckedChange={(checked) =>
                        update({
                          options: q.options?.map((o, i) => ({
                            ...o,
                            isCorrect: i === index && checked === true,
                          })),
                        })
                      }
                      aria-label={`Select option ${String.fromCharCode(65 + index)} as answer for question ${number}`}
                    />
                    Select as answer
                  </label>
                  {typeLabel !== "True / False" && (
                    <Button
                      type="button"
                      variant="ghost"
                      className={`${actionClass} text-ruby`}
                      aria-label={`Remove option ${String.fromCharCode(65 + index)} from question ${number}`}
                      onClick={() =>
                        update({ options: q.options?.filter((_, i) => i !== index) })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
                {typeLabel === "True / False" ? (
                  <p className="text-base text-ink">{index === 0 ? "True" : "False"}</p>
                ) : (
                  <RichTextEditor
                    id={`${prefix}-option-${index}`}
                    label={`Option ${String.fromCharCode(65 + index)}`}
                    value={option.optionText}
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
            {typeLabel !== "True / False" && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full border-dashed border-line text-ink"
                onClick={() =>
                  update({
                    options: [...(q.options ?? []), { optionText: "", isCorrect: false }],
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
          <fieldset className="space-y-3">
            <legend className="mb-2 text-base font-semibold text-ink">Gap answers</legend>
            <p className="text-base text-sub">
              Insert [gap] in the question for each answer, in order. Answers ignore case
              and surrounding spaces. Every gap must be correct to earn marks.
            </p>
            {(q.blanks ?? []).map((blank, index) => (
              <div key={index} className="space-y-1">
                <Label htmlFor={`${prefix}-blank-${index}`} className="text-base">
                  Gap {index + 1}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={`${prefix}-blank-${index}`}
                    className="min-h-11 text-base"
                    value={blank.acceptedAnswer}
                    onChange={(e) =>
                      update({
                        blanks: q.blanks?.map((b, i) =>
                          i === index ? { acceptedAnswer: e.target.value } : b,
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className={`${actionClass} text-ruby`}
                    aria-label={`Remove gap ${index + 1}`}
                    onClick={() =>
                      update({ blanks: q.blanks?.filter((_, i) => i !== index) })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="min-h-11 border-line text-ink"
              onClick={() =>
                update({ blanks: [...(q.blanks ?? []), { acceptedAnswer: "" }] })
              }
            >
              <Plus className="size-4" />
              Add gap answer
            </Button>
            {fieldErrors("blanks")}
          </fieldset>
        )}
        {q.questionType === "essay" && (
          <p className="text-base text-sub">
            The teacher awards marks after submission. Results stay pending until grading
            is complete and an Admin releases them.
          </p>
        )}
        <RichTextEditor
          id={`${prefix}-reason`}
          label="Reason / explanation (optional)"
          value={q.reasonRichText ?? ""}
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
              update({ marks: e.target.value === "" ? 0 : Number(e.target.value) })
            }
            aria-invalid={errors.some((e) => e.path.endsWith(".marks"))}
          />
          {fieldErrors("marks")}
        </div>
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
}: {
  questions: BuilderQuestion[];
  collapseSavedQuestions?: boolean;
  passages: BuilderPassage[];
  onChange: (questions: BuilderQuestion[], passages: BuilderPassage[]) => void;
  errors?: QuizPublishBlocker[];
  uploadImage?: QuizImageUploader;
}) {
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
    } else
      changeQuestions([
        ...questions,
        newBuilderQuestion(type, crypto.randomUUID(), chooser?.passageKey ?? null),
      ]);
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
      collapsedInitially={collapseSavedQuestions && q.id !== undefined}
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
        changeQuestions([
          ...questions.slice(0, position + 1),
          duplicateBuilderQuestion(q, crypto.randomUUID()),
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
            disabled={!selected.some((key) => questions.some((q) => q.clientKey === key))}
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
