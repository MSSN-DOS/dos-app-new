"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, apiFetch } from "@/lib/auth/client-fetch";

type LeaderboardEntry = {
  rank: number;
  userId: number;
  name: string;
  score: number;
};

type LeaderboardResponse = {
  data: LeaderboardEntry[];
  weeks: string[];
  week: string | null;
};

type Track = "student" | "aspirant";

export default function LeaderboardPage() {
  const [track, setTrack] = useState<Track>("student");
  const [selectedWeek, setSelectedWeek] = useState<string>("recent");

  const queryString = new URLSearchParams({ track });
  if (selectedWeek !== "recent") queryString.set("week", selectedWeek);

  const boardQuery = useQuery({
    queryKey: ["admin", "leaderboard", track, selectedWeek],
    queryFn: () =>
      apiFetch<LeaderboardResponse>(`/admin/leaderboard?${queryString.toString()}`),
  });

  const entries = boardQuery.data?.data ?? [];
  const weeks = boardQuery.data?.weeks ?? [];
  const resolvedWeek = boardQuery.data?.week ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Student and Aspirant rankings are kept separate. Only released weeks appear here.
        </p>
      </div>

      <Tabs value={track} onValueChange={(value) => setTrack(value as Track)}>
        <TabsList>
          <TabsTrigger value="student" className="min-h-11">Students</TabsTrigger>
          <TabsTrigger value="aspirant" className="min-h-11">Aspirants</TabsTrigger>
        </TabsList>
      </Tabs>

      <Select
        value={selectedWeek}
        onValueChange={setSelectedWeek}
        disabled={weeks.length === 0}
      >
        <SelectTrigger className="min-h-11 w-full sm:w-64" aria-label="Week">
          <SelectValue
            placeholder={
              boardQuery.isPending ? "Loading…" : "Most recent released week"
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="recent">Most recent released week</SelectItem>
          {weeks.map((week) => (
            <SelectItem key={week} value={week}>
              Week of {week}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {boardQuery.isPending && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading leaderboard">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {boardQuery.isError && (
        <div className="rounded-md border p-6 text-center" role="alert">
          <p className="text-sm text-muted-foreground">
            {boardQuery.error instanceof ApiError
              ? boardQuery.error.message
              : "Something went wrong"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 min-h-11"
            onClick={() => void boardQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {boardQuery.isSuccess && entries.length === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No rankings yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Rankings appear once a week&apos;s scores are released.
          </p>
        </div>
      )}

      {entries.length > 0 && (
        <>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Week of {resolvedWeek}
          </p>
          <div className="overflow-x-auto rounded-md border">
            <Table aria-label={`Top ${track}s`}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>{track === "student" ? "CGPA" : "Post-UTME /100"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.userId}>
                    <TableCell>#{entry.rank}</TableCell>
                    <TableCell>{entry.name}</TableCell>
                    <TableCell>
                      {track === "student"
                        ? (entry.score > 5 ? entry.score / 20 : entry.score).toFixed(2)
                        : entry.score}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
