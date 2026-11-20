"use client";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { QuestionAnalysis } from "@/lib/db/quiz-results";
export interface QuizResultAnalytics {
  distribution: { range: string; count: number }[];
  durations: { label: string; seconds: number | null }[];
  questions: QuestionAnalysis[];
}
const config = {
  count: { label: "Released attempts", color: "hsl(var(--primary))" },
  accuracy: { label: "Full marks (%)", color: "hsl(var(--accent))" },
  seconds: { label: "Duration (seconds)", color: "hsl(var(--primary))" },
} satisfies ChartConfig;
export function QuizResultCharts({ analytics }: { analytics: QuizResultAnalytics }) {
  const released = analytics.distribution.reduce((sum, row) => sum + row.count, 0);
  if (!released)
    return (
      <p className="rounded-xl border border-dashed border-line p-4 text-base text-sub">
        Charts will appear after an Admin releases results.
      </p>
    );
  const averageDuration = analytics.durations.length
    ? Math.round(
        analytics.durations.reduce((sum, row) => sum + (row.seconds ?? 0), 0) /
          analytics.durations.length,
      )
    : null;
  return (
    <section aria-label="Released result charts" className="min-w-0 space-y-4">
      <p className="text-base text-sub">
        Charts use released attempts only. Held scores and answer outcomes are excluded.
      </p>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-xl border border-line bg-panel p-4">
          <h2 className="text-lg font-semibold">Score distribution</h2>
          <ChartContainer config={config} className="mt-3 h-56 w-full">
            <BarChart accessibilityLayer data={analytics.distribution}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="range" tickLine={false} />
              <YAxis allowDecimals={false} width={32} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={4} />
            </BarChart>
          </ChartContainer>
          <ul className="sr-only">
            {analytics.distribution.map((row) => (
              <li key={row.range}>
                {row.range}%: {row.count} attempts
              </li>
            ))}
          </ul>
        </section>
        <section className="min-w-0 rounded-xl border border-line bg-panel p-4">
          <h2 className="text-lg font-semibold">Attempt duration</h2>
          {averageDuration !== null && (
            <p className="text-base text-sub">
              Average: {Math.floor(averageDuration / 60)}m {averageDuration % 60}s
            </p>
          )}
          {analytics.durations.length ? (
            <ChartContainer config={config} className="mt-3 h-56 w-full">
              <LineChart accessibilityLayer data={analytics.durations}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" hide />
                <YAxis width={48} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  dataKey="seconds"
                  stroke="var(--color-seconds)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          ) : (
            <p className="py-8 text-base text-sub">No recorded durations.</p>
          )}
        </section>
      </div>
      <section className="min-w-0 rounded-xl border border-line bg-panel p-4">
        <h2 className="text-lg font-semibold">Question analysis</h2>
        <p className="text-base text-sub">
          Percentage earning full question marks. Essays reflect teacher awards.
        </p>
        {analytics.questions.length > 0 && (
          <ChartContainer config={config} className="mt-3 h-64 w-full">
            <BarChart accessibilityLayer data={analytics.questions}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} />
              <YAxis domain={[0, 100]} width={36} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="accuracy" fill="var(--color-accuracy)" radius={3} />
            </BarChart>
          </ChartContainer>
        )}
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {analytics.questions.map((q) => (
            <li key={q.questionId} className="rounded-lg bg-canvas p-3 text-base">
              <span className="font-semibold">{q.label}</span>: {q.accuracy ?? "—"}% full
              marks · average {q.averageMarks ?? "—"}/{q.marks} marks · {q.attempts}{" "}
              attempts
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
