import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { quizBuilderDocumentSchema } from "@/lib/validation/quiz-builder";
import { initialQuizSettings } from "@/lib/validation/quiz-settings";
import { QuizBuilderEditor } from "./quiz-builder-editor";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/auth/client-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/auth/client-fetch")>()),
  apiFetch,
}));
vi.mock("./rich-text-editor", () => ({
  RichTextEditor: ({
    id,
    label,
    value,
    onChange,
  }: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <label htmlFor={id}>
      {label}
      <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  ),
}));

const document = quizBuilderDocumentSchema.parse({
  id: 9,
  revision: 3,
  quizType: "topic",
  status: "draft",
  details: {
    title: "Practice",
    description: "",
    instructions: "",
    durationSeconds: null,
    passMark: 60,
  },
  settings: initialQuizSettings,
  passages: [],
  questions: [],
});
function mount(complete = false) {
  const value = complete
    ? {
        ...document,
        questions: [
          {
            clientKey: "q1",
            questionType: "essay" as const,
            bodyRichText: "Explain the experiment",
            marks: 5,
            sortOrder: 0,
            passageKey: null,
            reasonRichText: "",
            options: [],
            blanks: [],
          },
        ],
      }
    : document;
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <QuizBuilderEditor document={value} basePath="/teacher/quizzes" />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  apiFetch.mockImplementation(async (url: string) =>
    url.endsWith("quiz-preferences")
      ? { data: { defaults: null, pinned: [] } }
      : { data: { saved: true } },
  );
});
describe("quiz authoring integration", () => {
  it("saves incomplete drafts with the revision while publishing remains blocked", async () => {
    mount();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByText(/What blocks publishing/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(apiFetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true),
    );
    const call = apiFetch.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(call?.[1].body ?? "{}")).toMatchObject({
      action: "draft",
      revision: 3,
      payload: { questions: [] },
    });
  }, 15000);
  it("publishes a complete essay without inventing an automatic answer", async () => {
    mount(true);
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(apiFetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true),
    );
    const call = apiFetch.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(call?.[1].body ?? "{}")).toMatchObject({
      action: "publish",
      payload: { questions: [{ questionType: "essay", marks: 5, options: [] }] },
    });
  }, 15000);
  it("previews the student introduction and the manually graded question", async () => {
    mount(true);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Practice");
    fireEvent.click(screen.getByRole("button", { name: "Start preview" }));
    expect(screen.getByLabelText("Your response")).toBeInTheDocument();
    expect(apiFetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  }, 15000);
});
