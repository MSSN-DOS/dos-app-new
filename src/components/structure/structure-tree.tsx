"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/auth/client-fetch";
import type { StructureNode } from "@/lib/db/structure-workspace";
import type { Selection, WorkspaceRoot } from "./types";

export function Branch({
  node,
  sessionId,
  selection,
  onSelect,
  children,
  autoOpen = false,
  courseToExpand,
}: {
  node: StructureNode;
  sessionId: number;
  selection: Selection | null;
  onSelect: (node: StructureNode) => void;
  children?: React.ReactNode;
  autoOpen?: boolean;
  courseToExpand?: number;
}) {
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [page, setPage] = useState(1);
  const open =
    expanded ?? (autoOpen || (node.kind === "course" && node.id === courseToExpand));
  const query = useQuery({
    queryKey: ["structure", "branch", node.kind, node.id, sessionId, page],
    enabled: open,
    queryFn: () =>
      apiFetch<{ data: { nodes: StructureNode[]; hasMore: boolean } }>(
        `/admin/structure/workspace?mode=branch&kind=${node.kind}${node.id ? "&id=" + node.id : ""}${sessionId ? "&sessionId=" + sessionId : ""}&page=${page}`,
      ),
  });
  const selected = selection?.kind === node.kind && selection.id === node.id;
  const hasChildren = node.kind !== "topic";
  const body = (
    <>
      {children}
      {query.isPending ? (
        <p role="status" className="px-3 py-2 text-sm text-sub">
          Loading…
        </p>
      ) : query.isError ? (
        <Button variant="ghost" className="min-h-11" onClick={() => query.refetch()}>
          Retry loading
        </Button>
      ) : query.data?.data.nodes.length ? (
        query.data.data.nodes.map((child) => (
          <Branch
            key={child.kind + child.id}
            node={child}
            sessionId={sessionId}
            selection={selection}
            onSelect={onSelect}
            courseToExpand={courseToExpand}
          />
        ))
      ) : (
        <p className="px-3 py-3 text-sm text-faint">
          {node.kind === "course" ? "No topics yet." : "No courses in this session."}
        </p>
      )}
      {query.data && (page > 1 || query.data.data.hasMore) && (
        <div className="flex items-center justify-between gap-1 py-2">
          <Button
            variant="ghost"
            className="min-h-11 px-2"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-sub">{page}</span>
          <Button
            variant="ghost"
            className="min-h-11 px-2"
            disabled={!query.data.data.hasMore}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </>
  );
  const selectButton = (
    <Button
      data-node-select
      aria-current={selected ? "page" : undefined}
      variant="ghost"
      className={`h-auto min-h-11 min-w-0 flex-1 justify-start whitespace-normal break-words rounded-lg px-2 py-2 text-left text-sm ${selected ? "bg-wash text-brand" : "text-ink"}`}
      onClick={() => (node.id ? onSelect(node) : setExpanded(!open))}
    >
      <span>
        {node.title}
        {node.subtitle && (
          <span className="mt-1 block text-xs capitalize text-sub">{node.subtitle}</span>
        )}
      </span>
    </Button>
  );
  if (!hasChildren) return <li className="flex pl-5">{selectButton}</li>;
  return (
    <li>
      <div className="flex items-start">
        <Button
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11 shrink-0"
          aria-label={(open ? "Collapse " : "Expand ") + node.title}
          aria-expanded={open}
          onClick={() => setExpanded(!open)}
        >
          <ChevronRight
            className={`size-4 transition-transform ${open ? "rotate-90" : ""}`}
          />
        </Button>
        {selectButton}
      </div>
      {open && <ul className="ml-3 border-l border-line pl-2">{body}</ul>}
    </li>
  );
}

export function StructureTree({
  root,
  sessionId,
  selection,
  record,
  onSelect,
}: {
  root: WorkspaceRoot;
  sessionId: number;
  selection: Selection | null;
  record?: Record<string, unknown>;
  onSelect: (node: StructureNode) => void;
}) {
  const departmentId =
    selection?.kind === "department"
      ? selection.id
      : Number(record?.departmentId) || undefined;
  const courseToExpand =
    selection?.kind === "course"
      ? selection.id
      : selection?.kind === "topic"
        ? Number(record?.id)
        : undefined;
  const facultyId =
    selection?.kind === "faculty"
      ? selection.id
      : (root.departments.find((d) => d.id === departmentId)?.facultyId ??
        Number(record?.facultyId));
  return (
    <nav
      aria-label="Academic structure"
      onKeyDown={(event) => {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            "button[data-node-select]",
          ),
        );
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : Math.max(
                  0,
                  Math.min(
                    buttons.length - 1,
                    index + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                );
        buttons[next]?.focus();
      }}
    >
      <p className="px-2 py-3 font-mono text-[11px] uppercase tracking-wider text-faint">
        Faculties
      </p>
      <ul>
        {root.faculties.map((f) => (
          <Branch
            key={f.id}
            node={{ kind: "faculty", id: f.id, title: f.name }}
            sessionId={sessionId}
            selection={selection}
            onSelect={onSelect}
            autoOpen={facultyId === f.id}
            courseToExpand={courseToExpand}
          >
            {root.departments
              .filter((d) => d.facultyId === f.id)
              .map((d) => (
                <Branch
                  key={d.id}
                  node={{ kind: "department", id: d.id, title: d.name }}
                  sessionId={sessionId}
                  selection={selection}
                  onSelect={onSelect}
                  autoOpen={departmentId === d.id}
                  courseToExpand={courseToExpand}
                />
              ))}
          </Branch>
        ))}
      </ul>
      <p className="px-2 pt-5 font-mono text-[11px] uppercase tracking-wider text-faint">
        Shared courses
      </p>
      <ul>
        <Branch
          node={{ kind: "course", id: 0, title: "General & interfaculty" }}
          sessionId={sessionId}
          selection={selection}
          onSelect={onSelect}
          autoOpen={Boolean(
            record && ["general", "interfaculty"].includes(String(record.scopeType)),
          )}
          courseToExpand={courseToExpand}
        />
      </ul>
      <p className="px-2 pt-5 font-mono text-[11px] uppercase tracking-wider text-faint">
        Levels
      </p>
      <ul>
        {root.levels.map((l) => (
          <Branch
            key={l.id}
            node={{ kind: "level", id: l.id, title: l.value + "L" }}
            sessionId={sessionId}
            selection={selection}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </nav>
  );
}
