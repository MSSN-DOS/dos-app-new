"use client";

import { useState } from "react";
import { ChevronDown, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  filterQuizSettings,
  scheduleDateValue,
  scheduleInputValue,
  type QuizSettingDefinition,
} from "@/lib/quizzes/settings";
import type {
  QuizSettingKey,
  QuizSettingsDraftInput,
} from "@/lib/validation/quiz-settings";
import type { QuizPublishBlocker } from "@/lib/validation/quiz-questions";

export function QuizSettingsPanel({
  value,
  onChange,
  pinned,
  onPin,
  onSaveDefaults,
  savingDefaults,
  error,
  errors = [],
}: {
  value: QuizSettingsDraftInput;
  onChange: (value: QuizSettingsDraftInput) => void;
  pinned: QuizSettingKey[];
  onPin: (key: QuizSettingKey) => void;
  onSaveDefaults: () => void;
  savingDefaults: boolean;
  error?: string;
  errors?: QuizPublishBlocker[];
}) {
  const [query, setQuery] = useState("");
  const filtered = filterQuizSettings(query);
  const pinnedRows = filtered.filter((s) => pinned.includes(s.key));
  const groups = [
    ...new Set(filtered.filter((s) => !pinned.includes(s.key)).map((s) => s.group)),
  ];
  const row = (setting: QuizSettingDefinition) => {
    const state = value[setting.key];
    const checked = typeof state === "boolean" ? state : state !== "never";
    const id = `quiz-setting-${setting.key}`;
    return (
      <div
        key={setting.key}
        className="space-y-3 border-b border-line py-4 last:border-0"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Label
              htmlFor={id}
              className="flex min-h-11 cursor-pointer items-center text-base font-semibold text-ink"
            >
              {setting.label}
            </Label>
            <p id={`${id}-description`} className="text-base leading-relaxed text-sub">
              {setting.description}
            </p>
          </div>
          <div className="flex min-h-11 items-center">
            <Switch
              id={id}
              checked={checked}
              disabled={setting.key === "requireLoginToAttempt"}
              aria-describedby={`${id}-description`}
              className="min-h-11 min-w-14 data-[state=checked]:bg-brand"
              onCheckedChange={(enabled) => {
                if (
                  setting.key === "showAnswersAfter" ||
                  setting.key === "showResultAfter"
                )
                  onChange({
                    ...value,
                    [setting.key]: enabled
                      ? setting.key === "showAnswersAfter"
                        ? "after_attempt"
                        : "after_release"
                      : "never",
                  });
                else if (setting.key === "scheduleEnabled")
                  onChange({
                    ...value,
                    scheduleEnabled: enabled,
                    ...(enabled ? {} : { opensAt: null, closesAt: null }),
                  });
                else onChange({ ...value, [setting.key]: enabled });
              }}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 min-w-11 text-ink"
            aria-label={`${pinned.includes(setting.key) ? "Unpin" : "Pin"} ${setting.label}`}
            aria-pressed={pinned.includes(setting.key)}
            onClick={() => onPin(setting.key)}
          >
            <Star
              className={`size-5 ${pinned.includes(setting.key) ? "fill-brand text-brand" : "text-sub"}`}
            />
          </Button>
        </div>
        {setting.key === "scheduleEnabled" && value.scheduleEnabled && (
          <div className="space-y-3 rounded-xl border border-line bg-canvas p-3">
            <p className="text-base text-sub">
              All dates and times use West Africa Time (UTC+1).
            </p>
            <div className="space-y-1">
              <Label htmlFor="quiz-opens-at" className="text-base">
                Start date and time
              </Label>
              <Input
                id="quiz-opens-at"
                type="datetime-local"
                className="min-h-11 min-w-0 w-full text-base"
                value={scheduleInputValue(value.opensAt)}
                onChange={(e) =>
                  onChange({ ...value, opensAt: scheduleDateValue(e.target.value) })
                }
                aria-invalid={errors.some((e) => e.path === "settings.opensAt")}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quiz-closes-at" className="text-base">
                End date and time (optional)
              </Label>
              <Input
                id="quiz-closes-at"
                type="datetime-local"
                className="min-h-11 min-w-0 w-full text-base"
                value={scheduleInputValue(value.closesAt)}
                onChange={(e) =>
                  onChange({ ...value, closesAt: scheduleDateValue(e.target.value) })
                }
                aria-invalid={errors.some((e) => e.path === "settings.closesAt")}
              />
            </div>
            {errors
              .filter(
                (e) =>
                  e.path.startsWith("settings.") &&
                  ["opensAt", "closesAt", "scheduleEnabled"].includes(
                    e.path.split(".")[1],
                  ),
              )
              .map((e) => (
                <p
                  key={`${e.path}-${e.message}`}
                  role="alert"
                  className="text-base text-ruby"
                >
                  {e.message}
                </p>
              ))}
          </div>
        )}
      </div>
    );
  };
  return (
    <aside
      className="min-w-0 space-y-4 rounded-2xl border border-line bg-panel p-3 sm:p-5"
      aria-labelledby="quiz-settings-heading"
    >
      <h2 id="quiz-settings-heading" className="text-xl font-semibold text-ink">
        Settings
      </h2>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-sub" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search quiz settings"
          placeholder="Search settings"
          className="min-h-11 pl-9 text-base"
        />
      </div>
      {pinnedRows.length > 0 && (
        <section aria-labelledby="pinned-settings-heading">
          <h3 id="pinned-settings-heading" className="text-base font-semibold text-ink">
            ★ Pinned settings
          </h3>
          {pinnedRows.map(row)}
        </section>
      )}
      {groups.map((group) => (
        <Collapsible
          key={`${group}-${query !== ""}`}
          defaultOpen={query !== "" || group === "Attempt rules"}
          className="rounded-xl border border-line px-3"
        >
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 w-full justify-between whitespace-normal py-3 text-left text-base text-ink"
            >
              {group}
              <ChevronDown className="size-5 shrink-0" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {filtered
              .filter((s) => s.group === group && !pinned.includes(s.key))
              .map(row)}
          </CollapsibleContent>
        </Collapsible>
      ))}
      {filtered.length === 0 && (
        <p role="status" className="text-base text-sub">
          No matching settings. Try a different search.
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full whitespace-normal border-line text-base text-ink"
        disabled={savingDefaults}
        onClick={onSaveDefaults}
      >
        {savingDefaults ? "Saving defaults…" : "Save as my defaults"}
      </Button>
      <p className="text-base text-sub">
        New quizzes get these settings. Choose their schedule dates separately.
      </p>
      {error && (
        <p role="alert" className="text-base text-ruby">
          {error}
        </p>
      )}
    </aside>
  );
}
