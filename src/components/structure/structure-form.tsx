"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/auth/client-fetch";
import {
  facultyCreateSchema,
  departmentCreateSchema,
  levelCreateSchema,
  courseCreateSchema,
} from "@/lib/validation/structure";
import { topicCreateSchema } from "@/lib/validation/topics";
import type { StructureKind } from "@/lib/validation/structure-workspace";
import { endpoints, kindLabels, type WorkspaceRoot } from "./types";

export function StructureForm({
  kind,
  record,
  preset,
  root,
  onClose,
  onSaved,
}: {
  kind: StructureKind;
  record?: Record<string, unknown>;
  preset: Record<string, unknown>;
  root: WorkspaceRoot;
  onClose: () => void;
  onSaved: (kind: StructureKind, id: number, sessionId?: number) => Promise<void>;
}) {
  const start = { ...preset, ...record };
  const [scope, setScope] = useState(String(start.scopeType ?? "department"));
  const [selectedLevels, setSelectedLevels] = useState<number[]>(
    (start.levelIds as number[]) ?? [],
  );
  const [selectedFaculties, setSelectedFaculties] = useState<number[]>(
    (start.facultyIds as number[]) ?? [],
  );
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    if (dirty) window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const subjects = useQuery({
    queryKey: ["structure", "topic-courses"],
    enabled: kind === "topic",
    queryFn: () =>
      apiFetch<{
        data: {
          id: number;
          code: string;
          title: string;
          sessionId: number;
          levelId: number;
          semester: string;
        }[];
      }>("/admin/structure/courses"),
  });
  const save = useMutation({
    mutationFn: (body: unknown) =>
      apiFetch<{ id: number; sessionId?: number }>(
        endpoints[kind] + (record ? "/" + record.id : ""),
        { method: record ? "PATCH" : "POST", body: JSON.stringify(body) },
      ),
    onSuccess: async (row) => {
      await onSaved(kind, row.id, row.sessionId);
      toast.success(kindLabels[kind] + " saved");
      onClose();
    },
    onError: (e) => setError(e.message),
  });
  const pick = (
    name: string,
    title: string,
    items: { id: number | string; title: string }[],
    value?: unknown,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={"field-" + name}>{title}</Label>
      <Select
        name={name}
        defaultValue={value == null ? "" : String(value)}
        onValueChange={() => setDirty(true)}
      >
        <SelectTrigger id={"field-" + name} className="min-h-11 w-full">
          <SelectValue placeholder={"Choose " + title.toLowerCase()} />
        </SelectTrigger>
        <SelectContent>
          {items.map((x) => (
            <SelectItem key={x.id} value={String(x.id)}>
              {x.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const text = (name: string, title: string, max: number, type = "text") => (
    <div className="space-y-2">
      <Label htmlFor={"field-" + name}>{title}</Label>
      <Input
        id={"field-" + name}
        name={name}
        type={type}
        maxLength={max}
        defaultValue={String(start[name] ?? "")}
        className="min-h-11 text-base"
      />
    </div>
  );
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const schemas = {
      faculty: facultyCreateSchema,
      department: departmentCreateSchema,
      level: levelCreateSchema,
      course: courseCreateSchema,
      topic: topicCreateSchema,
    };
    const body =
      kind === "department"
        ? { ...raw, levelIds: selectedLevels }
        : kind === "course"
          ? {
              ...raw,
              scopeType: scope,
              departmentId: scope === "department" ? raw.departmentId : null,
              facultyId: scope === "faculty" ? raw.facultyId : null,
              facultyIds: scope === "interfaculty" ? selectedFaculties : undefined,
            }
          : raw;
    const result = schemas[kind].safeParse(body);
    if (!result.success) {
      setError(result.error.issues.map((i) => i.message).join(". "));
      return;
    }
    save.mutate(result.data);
  };
  const close = () => {
    if (!save.isPending) {
      if (dirty) setDiscard(true);
      else onClose();
    }
  };
  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <SheetContent className="w-full overflow-y-auto bg-panel sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {record ? "Edit" : "New"} {kindLabels[kind].toLowerCase()}
            </SheetTitle>
            <SheetDescription>Update the academic structure.</SheetDescription>
          </SheetHeader>
          <form
            onSubmit={submit}
            onChange={() => setDirty(true)}
            className="space-y-5 px-5 pb-6"
          >
            {(kind === "faculty" || kind === "department") && text("name", "Name", 150)}
            {kind === "level" && text("value", "Level", 4, "number")}
            {kind === "department" && (
              <>
                {pick(
                  "facultyId",
                  "Faculty",
                  root.faculties.map((r) => ({ id: r.id, title: r.name })),
                  start.facultyId,
                )}
                <fieldset>
                  <legend className="mb-2 text-base font-medium">Levels offered</legend>
                  {root.levels.map((r) => (
                    <label key={r.id} className="flex min-h-11 items-center gap-3">
                      <Checkbox
                        checked={selectedLevels.includes(r.id)}
                        onCheckedChange={(checked) => {
                          setDirty(true);
                          setSelectedLevels((old) =>
                            checked ? [...old, r.id] : old.filter((id) => id !== r.id),
                          );
                        }}
                      />
                      {r.value}L
                    </label>
                  ))}
                </fieldset>
              </>
            )}
            {kind === "course" && (
              <>
                {text("code", "Course code", 20)}
                {text("title", "Title", 200)}
                {pick(
                  "sessionId",
                  "Academic session",
                  root.sessions.map((r) => ({ id: r.id, title: r.label })),
                  start.sessionId,
                )}
                {pick(
                  "levelId",
                  "Level",
                  root.levels.map((r) => ({ id: r.id, title: r.value + "L" })),
                  start.levelId,
                )}
                {pick(
                  "semester",
                  "Semester",
                  [
                    { id: "harmattan", title: "Harmattan" },
                    { id: "rain", title: "Rain" },
                  ],
                  start.semester ?? "harmattan",
                )}
                <div className="space-y-2">
                  <Label htmlFor="course-scope">Who takes this course?</Label>
                  <Select
                    value={scope}
                    onValueChange={(value) => {
                      setDirty(true);
                      setScope(value);
                    }}
                  >
                    <SelectTrigger id="course-scope" className="min-h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        ["department", "One department"],
                        ["faculty", "One whole faculty"],
                        ["interfaculty", "Several faculties"],
                        ["general", "Everyone"],
                      ].map(([id, title]) => (
                        <SelectItem key={id} value={id}>
                          {title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {scope === "department" &&
                  pick(
                    "departmentId",
                    "Department",
                    root.departments.map((r) => ({ id: r.id, title: r.name })),
                    start.departmentId,
                  )}
                {scope === "faculty" &&
                  pick(
                    "facultyId",
                    "Faculty",
                    root.faculties.map((r) => ({ id: r.id, title: r.name })),
                    start.facultyId,
                  )}
                {scope === "interfaculty" && (
                  <fieldset>
                    <legend className="text-base font-medium">Faculties</legend>
                    {root.faculties.map((r) => (
                      <label key={r.id} className="flex min-h-11 items-center gap-3">
                        <Checkbox
                          checked={selectedFaculties.includes(r.id)}
                          onCheckedChange={(checked) => {
                            setDirty(true);
                            setSelectedFaculties((old) =>
                              checked ? [...old, r.id] : old.filter((id) => id !== r.id),
                            );
                          }}
                        />
                        {r.name}
                      </label>
                    ))}
                  </fieldset>
                )}
              </>
            )}
            {kind === "topic" && (
              <>
                {subjects.isPending ? (
                  <p role="status">Loading courses…</p>
                ) : subjects.isError ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => subjects.refetch()}
                  >
                    Retry loading courses
                  </Button>
                ) : (
                  pick(
                    "courseId",
                    "Course",
                    (subjects.data?.data ?? []).map((r) => ({
                      id: r.id,
                      title: `${r.code} · ${r.title} · ${root.sessions.find((s) => s.id === r.sessionId)?.label ?? "Unknown session"} · ${root.levels.find((l) => l.id === r.levelId)?.value ?? "?"}L · ${r.semester}`,
                    })),
                    start.courseId,
                  )
                )}
                {text("title", "Topic title", 200)}
              </>
            )}
            {error && (
              <p role="alert" className="text-base text-ruby">
                {error}
              </p>
            )}
            <div className="flex gap-3 border-t border-line pt-4">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={save.isPending}
                onClick={close}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="min-h-11 flex-1"
                disabled={save.isPending || (kind === "topic" && !subjects.data)}
              >
                {save.isPending ? "Saving…" : "Save " + kindLabels[kind].toLowerCase()}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits have not been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>Discard changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
