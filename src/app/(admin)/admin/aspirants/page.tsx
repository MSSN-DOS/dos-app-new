"use client";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/auth/client-fetch";

interface AspirantRow {
  id: number;
  fullName: string;
  identifier: string;
  isActive: boolean;
  aspirationDepartment: string | null;
  latestPostUtme: string | null;
}

type PageMeta = { page: number; pageSize: number; total: number; totalPages: number };
type ListResponse = { data: AspirantRow[]; meta: PageMeta };

const PAGE_SIZE = 10;

export default function AspirantsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search.trim().length > 0) params.set("search", search.trim());

  const query = useQuery({
    queryKey: ["admin", "aspirants", params.toString()],
    queryFn: () => apiFetch<ListResponse>(`/admin/users/aspirants?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <AdminPageHeader
        kicker="Users"
        title="Aspirants"
        description="Directory of Post-UTME aspirants and their scores."
      />

      <div className="mt-6 grid gap-1.5 sm:max-w-sm">
        <Label htmlFor="aspirant-search">Search name or JAMB reg no.</Label>
        <Input
          id="aspirant-search"
          type="search"
          placeholder="e.g. Yusuf or 12345678AB"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="min-h-11"
        />
      </div>

      <div className="mt-6">
        {query.isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading aspirants">
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
              No aspirants match your search.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 min-h-11"
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
            >
              Clear search
            </Button>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table aria-label="Aspirants">
              <TableHeader>
                <TableRow>
                  <TableHead>Aspirant</TableHead>
                  <TableHead>Aspiring into</TableHead>
                  <TableHead>Post-UTME</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.data.map((aspirant) => (
                  <TableRow key={aspirant.id}>
                    <TableCell>
                      <p className={`text-base font-medium ${aspirant.isActive ? "" : "line-through text-muted-foreground"}`}>
                        {aspirant.fullName}
                      </p>
                      <p className="text-sm text-muted-foreground">{aspirant.identifier}</p>
                    </TableCell>
                    <TableCell>{aspirant.aspirationDepartment ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{aspirant.latestPostUtme ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm" className="min-h-11">
                        <Link href={`/admin/aspirants/${aspirant.id}`}>
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
              <nav className="flex items-center justify-between gap-3 border-t p-3" aria-label="Aspirants pagination">
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
