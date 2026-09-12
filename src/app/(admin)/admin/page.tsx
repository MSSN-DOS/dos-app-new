"use client";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { useQuery } from "@tanstack/react-query";
import { FileText, GraduationCap, ShieldCheck, Target, Users } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError } from "@/lib/auth/client-fetch";

interface DashboardData {
  counts: { students: number; aspirants: number; teachers: number };
  pendingReleases: number;
}

const statCards = [
  { key: "students", label: "Students", href: "/admin/students", icon: GraduationCap },
  { key: "aspirants", label: "Aspirants", href: "/admin/aspirants", icon: Target },
  { key: "teachers", label: "Teachers", href: "/admin/teachers", icon: Users },
] as const;

export default function AdminDashboardPage() {
  const query = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => apiFetch<DashboardData>("/admin/dashboard"),
  });

  return (
    <div>
      <AdminPageHeader
        kicker="Overview"
        title="Dashboard"
        description="Platform overview and the things that need your attention."
      />

      {query.isPending ? (
        <div
          className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3"
          aria-busy="true"
          aria-label="Loading dashboard"
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <div role="alert" className="mt-6 rounded-md border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {query.error instanceof ApiError
              ? query.error.message
              : "Something went wrong"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 min-h-11"
            onClick={() => void query.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {statCards.map((stat) => (
              <Link key={stat.key} href={stat.href} className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md">
                <Card>
                  <CardContent className="flex items-center gap-4 p-5">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
                      <stat.icon className="size-5" />
                    </span>
                    <span>
                      <span className="block text-2xl font-bold tabular-nums">
                        {query.data.counts[stat.key]}
                      </span>
                      <span className="text-sm text-muted-foreground">{stat.label}</span>
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <Card className="mt-4">
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    Pending score releases
                    <span
                      aria-label={`${query.data.pendingReleases} pending`}
                      className={`inline-flex min-h-6 items-center rounded-full px-2 text-xs font-semibold tabular-nums ${
                        query.data.pendingReleases > 0
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {query.data.pendingReleases}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Submitted quiz attempts waiting for your review.
                  </p>
                </div>
              </div>
              {query.data.pendingReleases > 0 ? (
                <Button asChild variant="outline" size="sm" className="min-h-11 shrink-0">
                  <Link href="/admin/scores/release">Review releases</Link>
                </Button>
              ) : (
                <span className="shrink-0 text-sm text-muted-foreground">
                  All caught up
                </span>
              )}
            </CardContent>
          </Card>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="outline" className="min-h-11 sm:flex-1">
              <Link href="/admin/content">
                <FileText aria-hidden="true" />
                Upload PDF / Article
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11 sm:flex-1">
              <Link href="/admin/teachers">
                <Users aria-hidden="true" />
                Manage Teachers
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
