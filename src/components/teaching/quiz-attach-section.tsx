"use client";

/**
 * The attach/detach section of the quiz builder.
 *
 * Extracted from `quiz-builder-view.tsx` as part of D-4. That component was a ~510-line function
 * with a cyclomatic complexity of 79 against a repository p90 of 3; this section alone accounted
 * for roughly half of it, because every filter, tab, selection state and error branch was an inline
 * conditional in one JSX tree.
 *
 * Nothing here decides anything. All validation lives in
 * `@/lib/quizzes/builder-validation`; this component renders what it is told and reports intent
 * upwards. That split is the whole point of the extraction — it is what makes the rules testable.
 */

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  attachProgress,
  requiredQuestionCount,
  type BuilderForm,
} from "@/lib/quizzes/builder-validation";
import { Plus, Search, SearchX, Trash2 } from "lucide-react";

import type { ApiError } from "@/lib/auth/client-fetch";

export type AttachedQuestion = {
  questionId: number;
  bodyRichText: string;
  questionType: "fill_in_gap" | "options";
  topicId: number | null;
  status: string;
};

export type BankQuestion = {
  id: number;
  bodyRichText: string;
  questionType: "fill_in_gap" | "options";
  status: string;
};

export type TopicOption = { id: number; title: string };

export type BankQueryState = {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

const TYPE_LABEL: Record<string, string> = {
  fill_in_gap: "Fill in the gap",
  options: "Options",
};

/** Debounce for the search box. 300ms is what the query key and every cached bank page assume. */
const SEARCH_DEBOUNCE_MS = 300;

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export type BankFilters = { topic: string; type: string; search: string };

/** The debounced search value the parent must include in the bank query key. */
export function useDebouncedBankSearch(search: string): string {
  const [debounced, setDebounced] = useState(search.trim());
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);
  return debounced;
}

export function QuizAttachSection({
  form,
  attachedRows,
  availableRows,
  topics,
  filters,
  onFiltersChange,
  bankState,
  attachable,
  actionError,
  attachPending,
  attachManyPending,
  resetSelectionKey,
  onAttachOne,
  onAttachMany,
  onDetachOne,
  onDetachMany,
  onRetry,
}: {
  form: BuilderForm;
  attachedRows: AttachedQuestion[];
  availableRows: BankQuestion[];
  topics: TopicOption[];
  filters: BankFilters;
  onFiltersChange: (next: Partial<BankFilters>) => void;
  bankState: BankQueryState;
  /** Questions in `availableRows` the server would actually accept (published only). */
  attachable: BankQuestion[];
  actionError: string | null;
  attachPending: boolean;
  attachManyPending: boolean;
  /** Bumped by the parent after a successful attach/detach to clear the tick selection. */
  resetSelectionKey: number;
  onAttachOne: (questionId: number) => void;
  onAttachMany: (questionIds: number[]) => void;
  onDetachOne: (questionId: number) => void;
  onDetachMany: (questionIds: number[]) => void;
  onRetry: () => void;
}) {
  const [tab, setTab] = useState<"available" | "attached">("available");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Changing any filter invalidates the selection: the ids were chosen against a different result
  // set, so keeping them would let a later "Attach selected" send rows that are no longer visible
  // or no longer attachable.
  const resetSelection = () => setSelectedIds([]);

  // The parent cannot reach `selectedIds`, so it signals a reset by bumping this key after a
  // successful mutation. Without this the ticks stay on and "Attach selected" re-sends rows the
  // server will now skip as already-attached.
  //
  // Adjusted during render rather than in an effect: this is React's documented pattern for
  // resetting state when an input changes, and `react-hooks/set-state-in-effect` rejects the
  // effect form because it renders the stale ticks for one frame first.
  const [seenResetKey, setSeenResetKey] = useState(resetSelectionKey);
  if (resetSelectionKey !== seenResetKey) {
    setSeenResetKey(resetSelectionKey);
    setSelectedIds([]);
  }

  const attachedIdSet = useMemo(
    () => new Set(attachedRows.map((q) => q.questionId)),
    [attachedRows],
  );
  const attachableIdSet = useMemo(() => new Set(attachable.map((q) => q.id)), [attachable]);

  const selectedAvailable = selectedIds.filter((id) => attachableIdSet.has(id));
  const selectedAttached = selectedIds.filter((id) => attachedIdSet.has(id));

  const allAvailableSelected =
    attachable.length > 0 && selectedAvailable.length === attachable.length;
  const allAttachedSelected =
    attachedRows.length > 0 && selectedAttached.length === attachedRows.length;

  const progress = attachProgress(form, attachedIdSet.size);
  const required = requiredQuestionCount(form, attachedIdSet.size);

  const toggleRow = (id: number) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleAllAvailable = () =>
    setSelectedIds((prev) =>
      allAvailableSelected
        ? prev.filter((id) => !attachableIdSet.has(id))
        : Array.from(new Set([...prev, ...attachable.map((q) => q.id)])),
    );

  const toggleAllAttached = () =>
    setSelectedIds((prev) =>
      allAttachedSelected
        ? prev.filter((id) => !attachedIdSet.has(id))
        : Array.from(new Set([...prev, ...attachedRows.map((q) => q.questionId)])),
    );

  const switchTab = (next: "available" | "attached") => {
    setTab(next);
    resetSelection();
  };

  return (
    <section className="rounded-2xl border border-line bg-panel p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          className="text-sm font-bold text-ink"
          style={{ fontFamily: "var(--font-fraunces), serif" }}
        >
          Attach questions
        </h2>
        <span className="rounded-full bg-canvas px-3 py-1 text-xs font-semibold text-sub">
          {attachedIdSet.size} of {required} attached · {progress}%
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-canvas">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-gold transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {actionError && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-ruby/30 bg-ruby/10 px-3 py-2 text-sm text-ruby"
        >
          {actionError}
        </p>
      )}

      <div
        className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-line bg-canvas p-1.5"
        role="tablist"
        aria-label="Question source"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "available"}
          onClick={() => switchTab("available")}
          className={`min-h-11 rounded-xl text-sm font-semibold transition-colors ${
            tab === "available" ? "bg-brand text-white shadow" : "text-sub hover:bg-line hover:text-ink"
          }`}
        >
          Available bank
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "attached"}
          onClick={() => switchTab("attached")}
          className={`min-h-11 rounded-xl text-sm font-semibold transition-colors ${
            tab === "attached" ? "bg-brand text-white shadow" : "text-sub hover:bg-line hover:text-ink"
          }`}
        >
          Attached · {attachedIdSet.size}
        </button>
      </div>

      {tab === "available" ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select
              value={filters.topic}
              onValueChange={(v) => {
                onFiltersChange({ topic: v });
                resetSelection();
              }}
            >
              <SelectTrigger
                aria-label="Filter bank by topic"
                className="min-h-11 w-full rounded-xl border-line bg-canvas text-ink"
              >
                <SelectValue placeholder="All topics" />
              </SelectTrigger>
              <SelectContent className="border-line bg-panel text-ink">
                <SelectItem value="__all__">All topics</SelectItem>
                {topics.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.type}
              onValueChange={(v) => {
                onFiltersChange({ type: v });
                resetSelection();
              }}
            >
              <SelectTrigger
                aria-label="Filter bank by type"
                className="min-h-11 w-full rounded-xl border-line bg-canvas text-ink"
              >
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent className="border-line bg-panel text-ink">
                <SelectItem value="__all__">All types</SelectItem>
                <SelectItem value="options">Options</SelectItem>
                <SelectItem value="fill_in_gap">Fill in the gap</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <Input
                value={filters.search}
                onChange={(e) => {
                  onFiltersChange({ search: e.target.value });
                  resetSelection();
                }}
                placeholder="Search question text…"
                aria-label="Search the question bank"
                className="min-h-11 w-full rounded-xl border-line bg-canvas pl-9 text-ink placeholder:text-faint"
              />
            </div>
          </div>

          {bankState.isPending ? (
            <div className="space-y-2" aria-busy="true" aria-label="Loading the question bank">
              <Skeleton className="h-16 w-full rounded-xl bg-line" />
              <Skeleton className="h-16 w-full rounded-xl bg-line" />
              <Skeleton className="h-16 w-full rounded-xl bg-line" />
            </div>
          ) : bankState.isError ? (
            <div className="rounded-xl border border-ruby/30 bg-ruby/10 p-4">
              <p role="alert" className="text-sm text-ruby">
                {(bankState.error as ApiError).message}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 min-h-9 rounded-xl border-line bg-panel text-ink"
                onClick={onRetry}
              >
                Try again
              </Button>
            </div>
          ) : availableRows.length === 0 ? (
            <EmptyBank />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-canvas px-3 py-2.5">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-sub">
                  <Checkbox
                    checked={allAvailableSelected}
                    onCheckedChange={toggleAllAvailable}
                    aria-label="Select all published questions in this view"
                    className="border-line data-[state=checked]:border-brand data-[state=checked]:bg-brand"
                  />
                  Select all ({attachable.length})
                </label>
                <p className="text-[11px] text-faint">Only published questions attach to a quiz.</p>
                <div className="ml-auto flex items-center gap-2">
                  {selectedAvailable.length > 0 && (
                    <span
                      className="text-[11px] font-semibold text-brand-soft"
                      style={{ fontFamily: "JetBrains Mono, monospace" }}
                    >
                      {selectedAvailable.length} selected
                    </span>
                  )}
                  <Button
                    size="sm"
                    className="min-h-9 rounded-xl bg-brand text-white hover:bg-brand-hover disabled:opacity-40"
                    disabled={selectedAvailable.length === 0 || attachManyPending}
                    onClick={() => onAttachMany(selectedAvailable)}
                  >
                    {attachManyPending ? (
                      <>
                        <Plus className="size-3.5 animate-pulse" /> Attaching…
                      </>
                    ) : (
                      <>
                        <Plus className="size-3.5" /> Attach {selectedAvailable.length || "selected"}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas">
                {availableRows.map((q) => {
                  const isAttachable = q.status === "published";
                  const isSelected = selectedIds.includes(q.id);
                  return (
                    <li key={q.id} className="flex items-center gap-3 p-3 sm:p-4">
                      <Checkbox
                        checked={isSelected}
                        disabled={!isAttachable}
                        onCheckedChange={() => toggleRow(q.id)}
                        aria-label={
                          isAttachable
                            ? `Select question ${q.id} to attach`
                            : "Draft questions cannot be attached yet"
                        }
                        className="shrink-0 border-line data-[state=checked]:border-brand data-[state=checked]:bg-brand disabled:opacity-30"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {stripTags(q.bodyRichText) || "(empty draft)"}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-sub">
                          <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[11px] font-medium">
                            {TYPE_LABEL[q.questionType]}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              q.status === "published"
                                ? "bg-brand text-white"
                                : "border border-line bg-canvas text-sub"
                            }`}
                          >
                            {q.status === "published" ? "Published" : "Draft"}
                          </span>
                        </p>
                      </div>
                      {isAttachable ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-9 shrink-0 rounded-xl border-line bg-panel text-ink hover:bg-line"
                          disabled={attachPending}
                          onClick={() => onAttachOne(q.id)}
                        >
                          <Plus className="size-3.5" /> Add
                        </Button>
                      ) : (
                        <span className="shrink-0 text-[11px] font-medium text-faint">
                          Publish to attach
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {attachedRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-canvas/60 p-8 text-center">
              <SearchX className="mx-auto size-6 text-faint" />
              <p className="mt-2 text-sm font-medium text-ink">No questions attached yet.</p>
              <p className="mt-1 text-xs text-sub">
                Jump to the Available bank, tick a few rows and attach them in one go.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-canvas px-3 py-2.5">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-sub">
                  <Checkbox
                    checked={allAttachedSelected}
                    onCheckedChange={toggleAllAttached}
                    aria-label="Select all attached questions"
                    className="border-line data-[state=checked]:border-brand data-[state=checked]:bg-brand"
                  />
                  Select all ({attachedRows.length})
                </label>
                <div className="ml-auto flex items-center gap-2">
                  {selectedAttached.length > 0 && (
                    <span
                      className="text-[11px] font-semibold text-ruby"
                      style={{ fontFamily: "JetBrains Mono, monospace" }}
                    >
                      {selectedAttached.length} selected
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-9 rounded-xl border-ruby/40 bg-canvas text-ruby hover:bg-ruby/10 disabled:opacity-40"
                    disabled={selectedAttached.length === 0}
                    onClick={() => onDetachMany(selectedAttached)}
                  >
                    <Trash2 className="size-3.5" /> Remove {selectedAttached.length || "selected"}
                  </Button>
                </div>
              </div>

              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas">
                {attachedRows.map((q) => {
                  const isSelected = selectedIds.includes(q.questionId);
                  return (
                    <li key={q.questionId} className="flex items-center gap-3 p-3 sm:p-4">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(q.questionId)}
                        aria-label={`Select question ${q.questionId} to detach`}
                        className="shrink-0 border-line data-[state=checked]:border-brand data-[state=checked]:bg-brand"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {stripTags(q.bodyRichText) || "(empty draft)"}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-sub">
                          <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[11px] font-medium">
                            {TYPE_LABEL[q.questionType]}
                          </span>
                          {q.topicId != null && (
                            <span className="text-[11px] text-faint">topic {q.topicId}</span>
                          )}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-9 shrink-0 rounded-xl text-ruby hover:bg-ruby/10 hover:text-ruby"
                        onClick={() => onDetachOne(q.questionId)}
                      >
                        <Trash2 className="size-3.5" /> Remove
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function EmptyBank() {
  return (
    <div className="rounded-xl border border-dashed border-line bg-canvas/60 p-8 text-center">
      <SearchX className="mx-auto size-6 text-faint" />
      <p className="mt-2 text-sm font-medium text-ink">Nothing left to attach.</p>
      <p className="mt-1 text-xs text-sub">
        Every matching question is already attached to this quiz. Try a broader search — or publish
        fresh ones in the Question Bank.
      </p>
    </div>
  );
}