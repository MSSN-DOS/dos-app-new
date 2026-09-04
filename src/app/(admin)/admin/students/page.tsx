"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/auth/client-fetch";

interface StudentRow {
  id: number;
  fullName: string;
  identifier: string;
  isActive: boolean;
  departmentName: string | null;
  levelValue: number | null;
  currentCgpa: string | null;
}

type PageMeta = { page: number; pageSize: number; total: number; totalPages: number };
type ListResponse = { data: StudentRow[]; meta: PageMeta };
interface FacultyRow {
  id: number;
  name: string;
}
interface DepartmentRow {
  id: number;
  name: string;
  facultyId: number;
}
interface LevelRow {
  id: number;
  value: number;
}

const PAGE_SIZE = 10;

export default function StudentsPage() {
  const [search, setSearch] = useState("");
  const [facultyId, setFacultyId] = useState("all");
  const [departmentId, setDepartmentId] = useState("all");
  const [levelId, setLevelId] = useState("all");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search.trim().length > 0) params.set("search", search.trim());
  if (facultyId !== "all") params.set("facultyId", facultyId);
  if (departmentId !== "all") params.set("departmentId", departmentId);
  if (levelId !== "all") params.set("levelId", levelId);

  const query = useQuery({
    queryKey: ["admin", "students", params.toString()],
    queryFn: () => apiFetch<ListResponse>(`/admin/users/students?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  const facultiesQuery = useQuery({
    queryKey: ["admin", "structure", "faculties"],
    queryFn: () => apiFetch<{ data: FacultyRow[] }>("/admin/structure/faculties"),
    staleTime: 5 * 60 * 1000,
  });
  const departmentsQuery = useQuery({
    queryKey: ["admin", "structure", "departments"],
    queryFn: () => apiFetch<{ data: DepartmentRow[] }>("/admin/structure/departments"),
    staleTime: 5 * 60 * 1000,
  });
  const levelsQuery = useQuery({
    queryKey: ["admin", "structure", "levels"],
    queryFn: () => apiFetch<{ data: LevelRow[] }>("/admin/structure/levels"),
    staleTime: 5 * 60 * 1000,
  });

  const allDepartments = departmentsQuery.data?.data ?? [];
  const visibleDepartments =
    facultyId === "all"
      ? allDepartments
      : allDepartments.filter((d) => d.facultyId === Number(facultyId));

  const resetPage = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold">Students</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Directory of enrolled students with their performance.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="student-search">Search name or matric no.</Label>
          <Input
            id="student-search"
            type="search"
            placeholder="e.g. Bello or MAT/2023/0142"
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            className="min-h-11"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="student-faculty">Faculty</Label>
          <Select value={facultyId} onValueChange={(v) => resetPage(setFacultyId)(v)}>
            <SelectTrigger id="student-faculty" className="min-h-11 w-full">
              <SelectValue placeholder="All faculties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All faculties</SelectItem>
              {(facultiesQuery.data?.data ?? []).map((f) => (
                <SelectItem key={f.id} value={String(f.id)}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="student-department">Department</Label>
          <Select value={departmentId} onValueChange={(v) => resetPage(setDepartmentId)(v)}>
            <SelectTrigger id="student-department" className="min-h-11 w-full">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {visibleDepartments.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="student-level">Level</Label>
          <Select value={levelId} onValueChange={(v) => resetPage(setLevelId)(v)}>
            <SelectTrigger id="student-level" className="min-h-11 w-full">
              <SelectValue placeholder="All levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {(levelsQuery.data?.data ?? []).map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  {`${l.value}L`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-6">
        {query.isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading students">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <div role="alert" className="rounded-md border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {query.error instanceof ApiError
                ? query.error.message
                : "Something went wrong"}
            </p>
            <Button variant="outline" size="sm" className="mt-3 min-h-11" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        ) : query.data.data.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No students match your search or filters.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 min-h-11"
              onClick={() => {
                setSearch("");
                setFacultyId("all");
                setDepartmentId("all");
                setLevelId("all");
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table aria-label="Students">
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Department · Level</TableHead>
                  <TableHead>CGPA</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.data.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <p className={`text-base font-medium ${student.isActive ? "" : "line-through text-muted-foreground"}`}>
                        {student.fullName}
                      </p>
                      <p className="text-sm text-muted-foreground">{student.identifier}</p>
                    </TableCell>
                    <TableCell>
                      {student.departmentName ?? "—"} · {student.levelValue ? `${student.levelValue}L` : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {student.currentCgpa != null
                        ? (Number(student.currentCgpa) > 5 ? Number(student.currentCgpa) / 20 : Number(student.currentCgpa)).toFixed(2)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm" className="min-h-11">
                        <Link href={`/admin/students/${student.id}`}>
                          <Eye aria-hidden="true" />
                          View
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {query.data.meta.totalPages > 1 && (
              <nav className="flex items-center justify-between gap-3 border-t p-3" aria-label="Students pagination">
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={page <= 1 || query.isFetching}
                  onClick={() => setPage((v) => v - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {query.data.meta.page} of {query.data.meta.totalPages}
                </span>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={page >= query.data.meta.totalPages || query.isFetching}
                  onClick={() => setPage((v) => v + 1)}
                >
                  Next
                </Button>
              </nav>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
