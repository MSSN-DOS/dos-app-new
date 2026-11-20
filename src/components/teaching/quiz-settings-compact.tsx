"use client";
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { scheduleDateValue, scheduleInputValue } from "@/lib/quizzes/settings";
import type {
  QuizDraftPayloadInput,
  QuizPublishBlocker,
} from "@/lib/validation/quiz-questions";
import type { QuizSettingsDraftInput } from "@/lib/validation/quiz-settings";
type Details = QuizDraftPayloadInput["details"];
export function QuizSettingsCompact({
  value,
  onChange,
  details,
  onDetailsChange,
  quizType,
  advancedContent,
  errors,
}: {
  value: QuizSettingsDraftInput;
  onChange: (value: QuizSettingsDraftInput) => void;
  details: Details;
  onDetailsChange: (patch: Partial<Details>) => void;
  quizType: "course" | "topic";
  advancedContent: ReactNode;
  errors: QuizPublishBlocker[];
}) {
  const [advanced, setAdvanced] = useState(false);
  const toggle = (
    key:
      | "shuffleQuestions"
      | "shuffleOptions"
      | "allowResume"
      | "permitFocusLoss"
      | "autoNextQuestion"
      | "showCalculator"
      | "deductMarksForWrong",
    label: string,
    description: string,
  ) => (
    <div className="flex min-h-11 items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <Label
          htmlFor={`compact-${key}`}
          className="flex min-h-11 cursor-pointer items-center text-base font-medium"
        >
          {label}
        </Label>
        <p className="hidden text-sm text-sub md:block">{description}</p>
      </div>
      <label
        htmlFor={`compact-${key}`}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center"
      >
        <Switch
          id={`compact-${key}`}
          checked={value[key]}
          onCheckedChange={(enabled) => onChange({ ...value, [key]: enabled })}
        />
      </label>
    </div>
  );
  const attemptValue = !value.allowMultipleAttempts
    ? "1"
    : value.maxAttempts === null
      ? "unlimited"
      : String(value.maxAttempts);
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-sub">
          Grading
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="compact-duration" className="text-base">
              Time limit (minutes)
            </Label>
            <Input
              id="compact-duration"
              className="min-h-11 text-base"
              type="number"
              min={0}
              max={1440}
              step="any"
              placeholder="No limit"
              value={details.durationSeconds === null ? "" : details.durationSeconds / 60}
              onChange={(e) =>
                onDetailsChange({
                  durationSeconds:
                    e.target.value === "" || Number(e.target.value) === 0
                      ? null
                      : Math.round(Number(e.target.value) * 60),
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="compact-pass" className="text-base">
              Pass mark (%)
            </Label>
            <Input
              id="compact-pass"
              className="min-h-11 text-base"
              type="number"
              min={0}
              max={100}
              value={details.passMark}
              onChange={(e) => onDetailsChange({ passMark: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="compact-attempts" className="text-base">
              Attempts
            </Label>
            <Select
              value={attemptValue}
              onValueChange={(selected) =>
                onChange({
                  ...value,
                  allowMultipleAttempts: selected !== "1",
                  maxAttempts:
                    selected === "unlimited" || selected === "1"
                      ? null
                      : Number(selected),
                })
              }
            >
              <SelectTrigger id="compact-attempts" className="min-h-11 w-full text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="[&_[role=option]]:min-h-11 [&_[role=option]]:text-base">
                {[
                  "1",
                  "2",
                  "3",
                  "5",
                  "10",
                  "unlimited",
                  ...(!["1", "2", "3", "unlimited"].includes(attemptValue)
                    ? [attemptValue]
                    : []),
                ].map((option) => (
                  <SelectItem value={option} key={option}>
                    {option === "unlimited" ? "Unlimited" : option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {value.allowMultipleAttempts && value.maxAttempts !== null && (
              <div className="space-y-1 pt-2">
                <Label htmlFor="compact-attempt-limit" className="text-base">
                  Maximum attempts
                </Label>
                <Input
                  id="compact-attempt-limit"
                  type="number"
                  min={2}
                  max={100}
                  step={1}
                  className="min-h-11 text-base"
                  value={value.maxAttempts}
                  onChange={(event) =>
                    onChange({ ...value, maxAttempts: Number(event.target.value) })
                  }
                />
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-sub">
          Delivery
        </h2>
        <div className="space-y-1">
          <Label htmlFor="compact-results" className="text-base">
            Show results
          </Label>
          <Select
            value={value.showResultAfter === "never" ? "never" : "after_release"}
            onValueChange={(selected) =>
              onChange({
                ...value,
                showResultAfter: selected === "never" ? "never" : "after_release",
              })
            }
          >
            <SelectTrigger id="compact-results" className="min-h-11 w-full text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="[&_[role=option]]:min-h-11 [&_[role=option]]:text-base">
              <SelectItem value="after_release">After Admin release</SelectItem>
              <SelectItem value="never">Hidden</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-base text-sub">
            Results stay held until grading is complete and an Admin releases them.
          </p>
        </div>
        {toggle(
          "shuffleQuestions",
          "Shuffle questions",
          "Passage questions move together.",
        )}
      </section>
      {quizType === "course" && (
        <section className="space-y-3 rounded-xl border border-line bg-panel p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-sub">
            Availability · WAT (UTC+1)
          </h2>
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-base">
            Set availability
            <span className="flex size-11 items-center justify-center">
              <Switch
                checked={value.scheduleEnabled}
                onCheckedChange={(enabled) =>
                  onChange({
                    ...value,
                    scheduleEnabled: enabled,
                    ...(enabled ? {} : { opensAt: null, closesAt: null }),
                  })
                }
              />
            </span>
          </label>
          {value.scheduleEnabled ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {(["opensAt", "closesAt"] as const).map((field) => (
                <div className="min-w-0 space-y-1" key={field}>
                  <Label htmlFor={`compact-${field}`} className="text-base">
                    {field === "opensAt" ? "Opens" : "Closes (optional)"}
                  </Label>
                  <Input
                    id={`compact-${field}`}
                    type="datetime-local"
                    className="min-h-11 min-w-0 w-full text-base"
                    value={scheduleInputValue(value[field])}
                    onChange={(e) =>
                      onChange({ ...value, [field]: scheduleDateValue(e.target.value) })
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-base text-sub">
              Weekly default: Saturday 00:00 to Monday 00:00 WAT.
            </p>
          )}
        </section>
      )}
      <Collapsible
        open={advanced}
        onOpenChange={setAdvanced}
        className="rounded-xl border border-line bg-panel p-4"
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="min-h-11 w-full justify-between px-0 text-base font-semibold"
          >
            Advanced
            <ChevronDown className={advanced ? "size-5 rotate-180" : "size-5"} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          {toggle(
            "allowResume",
            "Resume attempt",
            "Continue from saved answers with the original timer.",
          )}
          {toggle(
            "permitFocusLoss",
            "Allow focus loss",
            "Allow switching tabs and windows.",
          )}
          {toggle(
            "autoNextQuestion",
            "Auto-advance",
            "Move on after selecting a single answer.",
          )}
          {toggle(
            "shuffleOptions",
            "Shuffle all options",
            "Question-level settings can enable it separately.",
          )}
          {toggle(
            "showCalculator",
            "Show calculator",
            "All calculator features are free.",
          )}
          {toggle(
            "deductMarksForWrong",
            "Deduct marks for wrong answers",
            "Incorrect answered objective questions lose their full marks.",
          )}
          <div className="space-y-1">
            <Label htmlFor="compact-review" className="text-base">
              Reveal answers and explanations
            </Label>
            <Select
              value={value.showAnswersAfter}
              onValueChange={(selected) =>
                onChange({
                  ...value,
                  showAnswersAfter:
                    selected === "after_attempt"
                      ? "after_attempt"
                      : selected === "never"
                        ? "never"
                        : "after_release",
                })
              }
            >
              <SelectTrigger id="compact-review" className="min-h-11 w-full text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="[&_[role=option]]:min-h-11 [&_[role=option]]:text-base">
                <SelectItem value="never">Hidden</SelectItem>
                <SelectItem value="after_attempt">After attempt</SelectItem>
                <SelectItem value="after_release">After Admin release</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-base text-sub">
            Signed-in access is required for every attempt.
          </p>
          {advancedContent}
        </CollapsibleContent>
      </Collapsible>
      {errors
        .filter((e) => e.path.startsWith("settings.") || e.path.startsWith("details."))
        .map((e, i) => (
          <p key={i} role="alert" className="text-base text-ruby">
            {e.message}
          </p>
        ))}
    </div>
  );
}
