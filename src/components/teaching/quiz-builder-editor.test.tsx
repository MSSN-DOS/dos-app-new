import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
            numericAnswer: null,
            numericTolerance: 0,
            numericUnit: "",
            shuffleOptions: false,
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
  HTMLElement.prototype.scrollIntoView = vi.fn();
  apiFetch.mockImplementation(
    async (url: string, init?: { method?: string; body?: string }) =>
      url.endsWith("quiz-preferences")
        ? { data: { defaults: null, pinned: [] } }
        : init?.method === "PUT"
          ? {
              data: {
                revision: 4,
                status:
                  JSON.parse(init.body ?? "{}").action === "publish"
                    ? "published"
                    : "draft",
                questionIds: [],
                passageIds: {},
              },
            }
          : { data: { saved: true } },
  );
});
describe("quiz authoring integration", () => {
  it("autosaves edits made during an in-flight save using the next revision", async () => {
    let finishFirst: ((value: unknown) => void) | undefined;
    let writes = 0;
    apiFetch.mockImplementation(
      (url: string, init?: { method?: string; body?: string }) => {
        if (init?.method !== "PUT")
          return Promise.resolve({ data: { defaults: null, pinned: [] } });
        writes += 1;
        if (writes === 1)
          return new Promise((resolve) => {
            finishFirst = resolve;
          });
        return Promise.resolve({
          data: { revision: 5, status: "draft", questionIds: [41], passageIds: {} },
        });
      },
    );
    mount(true);
    fireEvent.change(screen.getByLabelText("Quiz header title"), {
      target: { value: "First title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(finishFirst).toBeDefined());
    fireEvent.change(screen.getByLabelText("Quiz header title"), {
      target: { value: "Latest title" },
    });
    finishFirst?.({
      data: { revision: 4, status: "draft", questionIds: [41], passageIds: {} },
    });
    await waitFor(() => expect(writes).toBe(2), { timeout: 10000 });
    const calls = apiFetch.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(JSON.parse(calls[0][1].body)).toMatchObject({
      revision: 3,
      payload: { details: { title: "First title" } },
    });
    expect(JSON.parse(calls[1][1].body)).toMatchObject({
      revision: 4,
      payload: { details: { title: "Latest title" }, questions: [{ id: 41 }] },
    });
    expect(screen.getByLabelText("Quiz header title")).toHaveValue("Latest title");
    await waitFor(() =>
      expect(screen.getAllByText("All changes saved").length).toBeGreaterThan(0),
    );
  }, 30000);
  it("preserves edits across tabs and saves a question chosen from the shared dialog", async () => {
    mount(true);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Settings" }));
    fireEvent.change(screen.getByLabelText("Quiz header title"), {
      target: { value: "Updated engineering quiz" },
    });
    fireEvent.click(screen.getByRole("combobox", { name: "Show results" }));
    fireEvent.click(screen.getByRole("option", { name: "Hidden" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Questions" }));
    fireEvent.click(screen.getByRole("button", { name: "Add new question" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Essay",
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Settings" }));
    expect(screen.getByLabelText("Quiz header title")).toHaveValue(
      "Updated engineering quiz",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(apiFetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true),
    );
    const call = apiFetch.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(call?.[1].body ?? "{}")).toMatchObject({
      action: "draft",
      payload: {
        details: { title: "Updated engineering quiz" },
        settings: { showResultAfter: "never" },
        questions: [{ questionType: "essay" }, { questionType: "essay" }],
      },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled(),
    );
  }, 30000);
  it("saves incomplete drafts with the revision while publishing remains blocked", async () => {
    mount();
    expect(screen.getAllByRole("button", { name: "Publish" })[0]).toBeDisabled();
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
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled(),
    );
  }, 30000);
  it("publishes a complete essay without inventing an automatic answer", async () => {
    mount(true);
    expect(screen.getAllByRole("button", { name: "Publish" })[0]).toBeEnabled();
    fireEvent.click(screen.getAllByRole("button", { name: "Publish" })[0]);
    await waitFor(() =>
      expect(apiFetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true),
    );
    const call = apiFetch.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(call?.[1].body ?? "{}")).toMatchObject({
      action: "publish",
      payload: { questions: [{ questionType: "essay", marks: 5, options: [] }] },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Unpublish" })).toBeEnabled(),
    );
  }, 30000);
  it("previews the student introduction and the manually graded question", async () => {
    mount(true);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Practice");
    fireEvent.click(screen.getByRole("button", { name: "Start preview" }));
    expect(screen.getByLabelText("Your response")).toBeInTheDocument();
    expect(apiFetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  }, 30000);
});
