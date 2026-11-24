"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  Copy,
  Plus,
  Search,
  Trash2,
  ListTree,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { CatalogDetails } from "@/components/teaching/catalog-details";
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command";
import { apiFetch } from "@/lib/auth/client-fetch";
import {
  structureKind,
  workspaceOperationSchema,
  type StructureKind,
  type WorkspaceOperation,
} from "@/lib/validation/structure-workspace";
import type { StructureNode } from "@/lib/db/structure-workspace";
import { StructureForm } from "./structure-form";
import { StructureTree, Branch } from "./structure-tree";
import { endpoints, kindLabels, type WorkspaceRoot, type Selection } from "./types";

const base = "/admin/structure";
const requestPath = "/admin/structure/workspace";
function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-xl border border-line bg-panel p-5">
      <p className="text-base text-ruby">{message}</p>
      <Button variant="outline" className="min-h-11" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}
export function StructureWorkspace() {
  const router = useRouter(),
    params = useSearchParams(),
    client = useQueryClient();
  const parsedKind = structureKind.safeParse(params.get("kind"));
  const id = Number(params.get("id"));
  const selection: Selection | null =
    parsedKind.success && Number.isSafeInteger(id) && id > 0
      ? { kind: parsedKind.data, id }
      : null;
  const sessionId = Number(params.get("session")) || 0;
  const selectionKey = selection ? selection.kind + selection.id : "";
  const [browseSelection, setBrowseSelection] = useState<string | null>(null);
  const mobileDetail = Boolean(selection) && browseSelection !== selectionKey;
  const setMobileDetail = (show: boolean) =>
    setBrowseSelection(show ? null : selectionKey);
  const [palette, setPalette] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [reminders, setReminders] = useState(false);
  const [form, setForm] = useState<{
    kind: StructureKind;
    record?: Record<string, unknown>;
    preset: Record<string, unknown>;
  } | null>(null);
  const [deleting, setDeleting] = useState<Selection | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [operation, setOperation] = useState<"copy" | "bulkTopics" | null>(null);
  const [operationSource, setOperationSource] = useState<{
    id: number;
    sessionId: number;
    title: string;
  } | null>(null);
  const [operationError, setOperationError] = useState("");
  const [targetSession, setTargetSession] = useState("");
  const [includeTopics, setIncludeTopics] = useState(true);
  const [titles, setTitles] = useState("");
  const detailRef = useRef<HTMLDivElement>(null);
  const root = useQuery({
    queryKey: ["structure", "root"],
    queryFn: () => apiFetch<{ data: WorkspaceRoot }>(requestPath + "?mode=root"),
  });
  const record = useQuery({
    queryKey: ["structure", "record", selection?.kind, selection?.id],
    enabled: Boolean(
      selection && (selection.kind === "course" || selection.kind === "topic"),
    ),
    queryFn: () =>
      apiFetch<{ data: Record<string, unknown> }>(
        `${requestPath}?mode=record&kind=${selection!.kind}&id=${selection!.id}`,
      ),
  });
  const searchQuery = useQuery({
    queryKey: ["structure", "search", debounced],
    enabled: Boolean(debounced),
    queryFn: () =>
      apiFetch<{ data: { nodes: StructureNode[]; hasMore: boolean } }>(
        requestPath + "?mode=search&q=" + encodeURIComponent(debounced),
      ),
  });
  const parentCourse = useQuery({
    queryKey: ["structure", "record", "course", record.data?.data.courseId],
    enabled: selection?.kind === "topic" && Boolean(record.data?.data.courseId),
    queryFn: () =>
      apiFetch<{ data: Record<string, unknown> }>(
        `${requestPath}?mode=record&kind=course&id=${record.data!.data.courseId}`,
      ),
  });
  const offering =
    selection?.kind === "topic"
      ? parentCourse.data?.data
      : selection?.kind === "course"
        ? record.data?.data
        : undefined;
  useEffect(() => {
    if (sessionId && offering?.sessionId && sessionId !== Number(offering.sessionId)) {
      const next = new URLSearchParams(params.toString());
      next.set("session", String(offering.sessionId));
      router.replace(base + "?" + next, { scroll: false });
    }
  }, [sessionId, offering?.sessionId, params, router]);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((open) => !open);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    detailRef.current?.scrollTo?.({ top: 0 });
  }, [selectionKey]);

  function navigate(node: Selection, session?: number) {
    const next = new URLSearchParams(params.toString());
    next.set("kind", node.kind);
    next.set("id", String(node.id));
    if (session !== undefined) {
      if (session) next.set("session", String(session));
      else next.delete("session");
    }
    next.delete("topicPage");
    next.delete("quizPage");
    router.push(base + "?" + next.toString(), { scroll: false });
    setMobileDetail(true);
    setPalette(false);
  }
  function selectNode(node: StructureNode) {
    navigate(node, node.sessionId ?? undefined);
  }
  function changeSession(value: string) {
    const next = new URLSearchParams(params.toString());
    if (Number(value)) next.set("session", value);
    else next.delete("session");
    if (selection?.kind === "course" || selection?.kind === "topic") {
      next.delete("kind");
      next.delete("id");
    }
    next.delete("topicPage");
    next.delete("quizPage");
    router.push(base + "?" + next, { scroll: false });
  }
  async function invalidate() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["structure"] }),
      client.invalidateQueries({ queryKey: ["catalog-details"] }),
      client.invalidateQueries({ queryKey: ["teacher", "subjects"] }),
      client.invalidateQueries({ queryKey: ["teacher", "topics"] }),
      client.invalidateQueries({ queryKey: ["admin", "structure"] }),
    ]);
  }
  async function saved(kind: StructureKind, id: number, session?: number) {
    await invalidate();
    navigate({ kind, id }, session);
  }
  const remove = useMutation({
    mutationFn: (node: Selection) =>
      apiFetch(endpoints[node.kind] + "/" + node.id, { method: "DELETE" }),
    onSuccess: async () => {
      setDeleting(null);
      await invalidate();
      const next = new URLSearchParams(params.toString());
      next.delete("kind");
      next.delete("id");
      router.push(base + "?" + next, { scroll: false });
      setMobileDetail(false);
      toast.success("Record deleted");
    },
    onError: (error) => setDeleteError(error.message),
  });
  const runOperation = useMutation({
    mutationFn: (body: WorkspaceOperation) =>
      apiFetch<{
        data: { id?: number; sessionId?: number; added?: number; skipped?: number };
      }>(requestPath, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async ({ data }) => {
      setOperation(null);
      setTitles("");
      await invalidate();
      if (data.id) navigate({ kind: "course", id: data.id }, data.sessionId);
      toast.success(
        data.id
          ? "Course copied"
          : `${data.added} topics added; ${data.skipped} duplicates skipped`,
      );
    },
    onError: (error) => setOperationError(error.message),
  });
  if (root.isPending)
    return (
      <p role="status" className="p-6 text-base text-sub">
        Loading academic structure…
      </p>
    );
  if (root.isError)
    return <ErrorState message={root.error.message} retry={() => root.refetch()} />;
  const data = root.data.data;
  let selectedRecord: Record<string, unknown> | undefined;
  if (selection?.kind === "faculty")
    selectedRecord = data.faculties.find((r) => r.id === selection.id);
  if (selection?.kind === "department") {
    const row = data.departments.find((r) => r.id === selection.id);
    if (row)
      selectedRecord = {
        ...row,
        levelIds: data.departmentLevels
          .filter((l) => l.departmentId === row.id)
          .map((l) => l.levelId),
      };
  }
  if (selection?.kind === "level")
    selectedRecord = data.levels.find((r) => r.id === selection.id);
  if (selection?.kind === "course" || selection?.kind === "topic")
    selectedRecord = record.data?.data;
  const title = selectedRecord
    ? String(selectedRecord.name ?? selectedRecord.title ?? selectedRecord.value + "L")
    : "";
  const preset =
    selection?.kind === "faculty"
      ? { facultyId: selection.id, scopeType: "faculty" }
      : selection?.kind === "department"
        ? { departmentId: selection.id, scopeType: "department" }
        : selection?.kind === "level"
          ? { levelId: selection.id }
          : selection?.kind === "course"
            ? { courseId: selection.id }
            : {};
  const openNew = (kind: StructureKind) => {
    setPalette(false);
    setForm({ kind, preset: { ...preset, ...(sessionId ? { sessionId } : {}) } });
  };
  const setupNodes: StructureNode[] = [
    ...data.faculties
      .filter((f) => !data.departments.some((d) => d.facultyId === f.id))
      .map((f) => ({
        kind: "faculty" as const,
        id: f.id,
        title: f.name,
        subtitle: "No departments yet",
      })),
    ...data.departments
      .filter((d) => !data.departmentLevels.some((l) => l.departmentId === d.id))
      .map((d) => ({
        kind: "department" as const,
        id: d.id,
        title: d.name,
        subtitle: "No levels configured",
      })),
  ];
  const nodeFor = (
    kind: StructureKind,
    row: { id: number; name?: string; value?: number },
  ): StructureNode => ({ kind, id: row.id, title: row.name ?? row.value + "L" });
  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[32rem] flex-col gap-5 text-ink">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-brand">
            Academic management
          </p>
          <h1
            className="mt-1 font-serif text-[32px] leading-tight"
            style={{ fontFamily: "var(--font-fraunces)" }}
          >
            Structure
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(sessionId)} onValueChange={changeSession}>
            <SelectTrigger aria-label="Academic session" className="min-h-11 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">All sessions</SelectItem>
              {data.sessions.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="min-h-11"
            aria-label="Search structure"
            onClick={() => setPalette(true)}
          >
            <Search className="size-4" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden text-xs text-sub lg:inline">⌘/Ctrl K</kbd>
          </Button>
          <Button
            className="min-h-11"
            onClick={() => {
              setSearch("");
              setPalette(true);
            }}
          >
            <Plus className="size-4" />
            New
          </Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-line bg-panel md:grid-cols-[300px_minmax(0,1fr)]">
        <aside
          className={`min-h-0 overflow-y-auto border-r border-line p-3 ${mobileDetail ? "hidden md:block" : ""}`}
          aria-label="Structure browser"
        >
          <div className="sticky top-0 z-10 space-y-2 bg-panel pb-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a name or course code"
              aria-label="Filter structure"
              className="min-h-11 text-base"
            />
            <div className="flex gap-1 rounded-xl bg-sunk p-1">
              <Button
                variant="ghost"
                className="min-h-11 flex-1 px-2"
                aria-pressed={!reminders}
                onClick={() => setReminders(false)}
              >
                Everything
              </Button>
              <Button
                variant="ghost"
                className="min-h-11 flex-1 px-2"
                aria-pressed={reminders}
                onClick={() => setReminders(true)}
              >
                Setup reminders
              </Button>
            </div>
          </div>
          {search.trim() ? (
            searchQuery.isPending ? (
              <p role="status" className="p-3 text-sub">
                Searching…
              </p>
            ) : searchQuery.isError ? (
              <ErrorState
                message={searchQuery.error.message}
                retry={() => searchQuery.refetch()}
              />
            ) : (
              <SearchResults
                nodes={searchQuery.data?.data.nodes ?? []}
                hasMore={searchQuery.data?.data.hasMore ?? false}
                root={data}
                onSelect={selectNode}
              />
            )
          ) : reminders ? (
            <SearchResults
              nodes={setupNodes}
              hasMore={false}
              root={data}
              onSelect={selectNode}
            />
          ) : (
            <StructureTree
              key={sessionId}
              root={data}
              sessionId={sessionId}
              selection={selection}
              record={
                selection?.kind === "topic" ? parentCourse.data?.data : selectedRecord
              }
              onSelect={selectNode}
            />
          )}
        </aside>
        <div
          ref={detailRef}
          className={`min-h-0 overflow-y-auto bg-canvas p-4 lg:p-6 ${!mobileDetail ? "hidden md:block" : ""}`}
        >
          <Button
            variant="ghost"
            className="mb-3 min-h-11 md:hidden"
            onClick={() => setMobileDetail(false)}
          >
            <ArrowLeft className="size-4" />
            Browse structure
          </Button>
          {!selection ? (
            <div className="grid h-full place-content-center gap-3 text-center">
              <BookOpen className="mx-auto size-8 text-faint" />
              <h2 className="text-xl font-semibold">Your academic structure</h2>
              <p className="max-w-xs text-base text-sub">
                Choose a record to manage its courses, topics and quizzes.
              </p>
            </div>
          ) : (selection.kind === "course" || selection.kind === "topic") &&
            record.isPending ? (
            <p role="status">Loading details…</p>
          ) : record.isError &&
            (selection.kind === "course" || selection.kind === "topic") ? (
            <ErrorState message={record.error.message} retry={() => record.refetch()} />
          ) : !selectedRecord ? (
            <p role="status">This record is no longer available.</p>
          ) : (
            <>
              <nav
                aria-label="Breadcrumb"
                className="mb-4 flex flex-wrap items-center gap-2 text-sm text-sub"
              >
                <Button
                  variant="ghost"
                  className="min-h-11 px-2"
                  onClick={() => setMobileDetail(false)}
                >
                  Structure
                </Button>
                <span>/</span>
                {selection.kind === "department" && (
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    onClick={() =>
                      navigate({ kind: "faculty", id: Number(selectedRecord.facultyId) })
                    }
                  >
                    {
                      data.faculties.find(
                        (f) => f.id === Number(selectedRecord.facultyId),
                      )?.name
                    }
                  </Button>
                )}
                {selection.kind === "topic" && (
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    onClick={() =>
                      navigate({ kind: "course", id: Number(selectedRecord.courseId) })
                    }
                  >
                    {String(parentCourse.data?.data.code ?? "Parent course")}
                  </Button>
                )}
                <span className="break-words">{kindLabels[selection.kind]}</span>
              </nav>
              <div className="mb-5 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() =>
                    setForm({ kind: selection.kind, record: selectedRecord, preset: {} })
                  }
                >
                  Edit {kindLabels[selection.kind].toLowerCase()}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11 text-ruby"
                  onClick={() => {
                    setDeleteError("");
                    setDeleting(selection);
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
                {selection.kind === "faculty" && (
                  <Button className="min-h-11" onClick={() => openNew("course")}>
                    New faculty-wide course
                  </Button>
                )}
                {selection.kind === "faculty" && (
                  <Button className="min-h-11" onClick={() => openNew("department")}>
                    New department
                  </Button>
                )}
                {(selection.kind === "department" || selection.kind === "level") && (
                  <Button className="min-h-11" onClick={() => openNew("course")}>
                    New course
                  </Button>
                )}
                {selection.kind === "course" && (
                  <>
                    <Button className="min-h-11" onClick={() => openNew("topic")}>
                      New topic
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => {
                        setOperationError("");
                        setOperationSource({
                          id: selection.id,
                          sessionId: Number(selectedRecord.sessionId),
                          title: String(selectedRecord.title),
                        });
                        setOperation("bulkTopics");
                      }}
                    >
                      Paste topics
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={
                        !data.sessions.some(
                          (s) => s.id !== Number(selectedRecord.sessionId),
                        )
                      }
                      onClick={() => {
                        setTargetSession("");
                        setIncludeTopics(true);
                        setOperationError("");
                        setOperationSource({
                          id: selection.id,
                          sessionId: Number(selectedRecord.sessionId),
                          title: String(selectedRecord.title),
                        });
                        setOperation("copy");
                      }}
                    >
                      <Copy className="size-4" />
                      Copy to session
                    </Button>
                  </>
                )}
              </div>
              {selection.kind === "course" || selection.kind === "topic" ? (
                <CatalogDetails
                  key={selection.kind + selection.id}
                  id={selection.id}
                  kind={selection.kind}
                  onTopicSelect={(id) =>
                    navigate({ kind: "topic", id }, Number(selectedRecord.sessionId))
                  }
                  pagination={{
                    topicPage: Math.max(1, Number(params.get("topicPage")) || 1),
                    quizPage: Math.max(1, Number(params.get("quizPage")) || 1),
                    onChange: (key, page) => {
                      const next = new URLSearchParams(params.toString());
                      next.set(key, String(page));
                      router.push(base + "?" + next, { scroll: false });
                    },
                  }}
                />
              ) : (
                <>
                  <section className="mb-5 rounded-2xl border border-line bg-panel p-5">
                    <p className="font-mono text-xs uppercase text-brand">
                      {kindLabels[selection.kind]}
                    </p>
                    <h2 className="mt-2 break-words text-2xl font-semibold">{title}</h2>
                    {selection.kind === "faculty" && (
                      <p className="mt-2 text-sub">
                        {
                          data.departments.filter((d) => d.facultyId === selection.id)
                            .length
                        }{" "}
                        departments
                      </p>
                    )}
                    {selection.kind === "department" && (
                      <p className="mt-2 text-sub">
                        Levels offered ·{" "}
                        {data.departmentLevels
                          .filter((d) => d.departmentId === selection.id)
                          .map(
                            (d) =>
                              data.levels.find((l) => l.id === d.levelId)?.value + "L",
                          )
                          .join(", ") || "No levels configured"}
                      </p>
                    )}
                    {selection.kind === "level" && (
                      <p className="mt-2 text-sub">
                        Shared by{" "}
                        {
                          data.departmentLevels.filter((d) => d.levelId === selection.id)
                            .length
                        }{" "}
                        departments
                      </p>
                    )}
                  </section>
                  {selection.kind === "faculty" && (
                    <section className="mb-5 rounded-2xl border border-line bg-panel p-5">
                      <h3 className="mb-3 font-semibold">Departments</h3>
                      {data.departments
                        .filter((d) => d.facultyId === selection.id)
                        .map((d) => (
                          <Button
                            key={d.id}
                            variant="ghost"
                            className="h-auto min-h-11 w-full justify-start whitespace-normal text-left"
                            onClick={() => selectNode(nodeFor("department", d))}
                          >
                            {d.name}
                          </Button>
                        ))}
                      {!data.departments.some((d) => d.facultyId === selection.id) && (
                        <p className="text-base text-sub">No departments yet.</p>
                      )}
                    </section>
                  )}
                  <section className="rounded-2xl border border-line bg-panel p-5">
                    <h3 className="mb-3 font-semibold">
                      {selection.kind === "faculty" ? "Faculty-wide courses" : "Courses"}
                    </h3>
                    <ul>
                      <Branch
                        key={selection.kind + selection.id + sessionId}
                        node={{ ...selection, title: "Browse courses" }}
                        sessionId={sessionId}
                        selection={selection}
                        onSelect={selectNode}
                        autoOpen
                      />
                    </ul>
                    <p className="mt-3 text-sm text-sub">
                      General and interfaculty offerings are available under Shared
                      courses.
                    </p>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </div>
      <nav
        aria-label="Structure tools"
        className="grid shrink-0 grid-cols-4 rounded-xl border border-line bg-panel md:hidden"
      >
        <Button
          variant="ghost"
          className="min-h-14 flex-col gap-1 px-1"
          onClick={() => {
            setSearch("");
            setReminders(false);
            setMobileDetail(false);
          }}
        >
          <ListTree className="size-4" />
          Browse
        </Button>
        <Button
          variant="ghost"
          className="min-h-14 flex-col gap-1 px-1"
          onClick={() => setPalette(true)}
        >
          <Search className="size-4" />
          Search
        </Button>
        <Button
          variant="ghost"
          className="min-h-14 flex-col gap-1 px-1"
          onClick={() => {
            setSearch("");
            setReminders(true);
            setMobileDetail(false);
          }}
        >
          <ListChecks className="size-4" />
          Setup
        </Button>
        <Button
          variant="ghost"
          className="min-h-14 flex-col gap-1 px-1"
          onClick={() => {
            setSearch("");
            setPalette(true);
          }}
        >
          <Plus className="size-4" />
          New
        </Button>
      </nav>
      <Dialog open={palette} onOpenChange={setPalette}>
        <DialogContent className="max-h-[85dvh] overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Search structure</DialogTitle>
            <DialogDescription>Find a record or create a new one.</DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false}>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder="Search or create…"
            />
            <CommandList className="max-h-[65dvh]">
              <CommandGroup heading="Create">
                {Object.entries(kindLabels).map(([kind, label]) => (
                  <CommandItem
                    key={kind}
                    value={"new-" + kind}
                    onSelect={() => openNew(kind as StructureKind)}
                    className="min-h-11"
                  >
                    New {label.toLowerCase()}
                  </CommandItem>
                ))}
              </CommandGroup>
              {debounced && (
                <CommandGroup heading="Records">
                  {!searchQuery.isPending &&
                    !searchQuery.isError &&
                    !searchQuery.data?.data.nodes.length && (
                      <p className="p-3 text-base text-sub">No matching records.</p>
                    )}
                  {searchQuery.data?.data.hasMore && (
                    <p className="p-3 text-base text-sub">
                      Showing the first matches. Refine your search to find more.
                    </p>
                  )}
                  {searchQuery.isPending ? (
                    <p role="status" className="p-3">
                      Searching…
                    </p>
                  ) : searchQuery.isError ? (
                    <p role="alert" className="p-3 text-ruby">
                      {searchQuery.error.message}
                    </p>
                  ) : (
                    (searchQuery.data?.data.nodes ?? []).map((node) => (
                      <CommandItem
                        key={node.kind + node.id}
                        value={node.kind + node.id}
                        onSelect={() => selectNode(node)}
                        className="min-h-11"
                      >
                        <span className="min-w-0 flex-1 break-words">{node.title}</span>
                        <span className="text-xs text-sub">
                          {node.sessionId
                            ? data.sessions.find((s) => s.id === node.sessionId)?.label
                            : kindLabels[node.kind]}
                        </span>
                      </CommandItem>
                    ))
                  )}
                </CommandGroup>
              )}
              <CommandEmpty>No matches.</CommandEmpty>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
      {form && (
        <StructureForm
          key={form.kind + String(form.record?.id ?? "new")}
          {...form}
          root={data}
          onClose={() => setForm(null)}
          onSaved={saved}
        />
      )}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleting ? kindLabels[deleting.kind].toLowerCase() : "record"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the record. Linked records may prevent deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="text-base text-ruby">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting)}
            >
              {remove.isPending ? "Deleting…" : "Delete record"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={Boolean(operation)}
        onOpenChange={(open) => {
          if (!open && !runOperation.isPending) setOperation(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {operation === "copy" ? "Copy to another session" : "Add topics"}
            </DialogTitle>
            <DialogDescription>
              {operationSource?.title}.{" "}
              {operation === "copy"
                ? "Create a new offering with the same academic scope. Quizzes stay in the source course."
                : "Enter up to 100 topics, one per line. Existing titles and repeated entries are skipped."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setOperationError("");
              const raw =
                operation === "copy"
                  ? {
                      action: "copy",
                      courseId: operationSource?.id,
                      sessionId: Number(targetSession),
                      includeTopics,
                    }
                  : {
                      action: "bulkTopics",
                      courseId: operationSource?.id,
                      titles: titles
                        .split(/\r?\n/)
                        .map((t) => t.trim())
                        .filter(Boolean),
                    };
              const result = workspaceOperationSchema.safeParse(raw);
              if (!result.success) {
                setOperationError(result.error.issues.map((i) => i.message).join(". "));
                return;
              }
              runOperation.mutate(result.data);
            }}
          >
            {operation === "copy" ? (
              <>
                <Label htmlFor="target-session">Target academic session</Label>
                <Select value={targetSession} onValueChange={setTargetSession}>
                  <SelectTrigger id="target-session" className="min-h-11 w-full">
                    <SelectValue placeholder="Choose a session" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.sessions
                      .filter((s) => s.id !== operationSource?.sessionId)
                      .map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <label className="flex min-h-11 items-center gap-3">
                  <Checkbox
                    checked={includeTopics}
                    onCheckedChange={(value) => setIncludeTopics(Boolean(value))}
                  />
                  Include topic titles
                </label>
              </>
            ) : (
              <>
                <Label htmlFor="bulk-topics">Topic titles</Label>
                <Textarea
                  id="bulk-topics"
                  value={titles}
                  onChange={(e) => setTitles(e.target.value)}
                  rows={8}
                  className="text-base"
                  placeholder="Atomic structure&#10;Crystal structures"
                />
              </>
            )}
            {operationError && (
              <p role="alert" className="text-base text-ruby">
                {operationError}
              </p>
            )}
            <Button
              type="submit"
              className="min-h-11 w-full"
              disabled={runOperation.isPending}
            >
              {runOperation.isPending
                ? "Saving…"
                : operation === "copy"
                  ? "Copy course"
                  : "Add topics"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function SearchResults({
  nodes,
  hasMore,
  root,
  onSelect,
}: {
  nodes: StructureNode[];
  hasMore: boolean;
  root: WorkspaceRoot;
  onSelect: (node: StructureNode) => void;
}) {
  return (
    <div className="space-y-1">
      {nodes.length ? (
        nodes.map((node) => (
          <Button
            key={node.kind + node.id}
            variant="ghost"
            className="h-auto min-h-11 w-full justify-start whitespace-normal p-3 text-left"
            onClick={() => onSelect(node)}
          >
            <span>
              <span className="block break-words">{node.title}</span>
              <span className="block text-xs text-sub">
                {kindLabels[node.kind]}
                {node.sessionId
                  ? " · " + root.sessions.find((s) => s.id === node.sessionId)?.label
                  : ""}
                {node.subtitle ? " · " + node.subtitle : ""}
              </span>
            </span>
          </Button>
        ))
      ) : (
        <p role="status" className="p-4 text-base text-sub">
          No matching records.
        </p>
      )}
      {hasMore && (
        <p className="p-3 text-sm text-sub">
          More results are available. Refine your search.
        </p>
      )}
    </div>
  );
}
