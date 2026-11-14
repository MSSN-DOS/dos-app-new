import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuizIntroductionData, StudentQuizAttempt } from "@/lib/quizzes/student";
import { QuizAttemptView, QuizReview } from "./quiz-attempt-view";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/auth/client-fetch", () => ({ apiFetch }));

const introduction: QuizIntroductionData = {
  title: "Engineering practice",
  description: "<p>Review the basics.</p>",
  instructions: "<p>Read carefully before starting.</p>",
  durationSeconds: null,
  passMark: 60,
  questionCount: 2,
  totalMarks: 10,
  coverImageUrl: null,
  allowMultipleAttempts: false,
  allowResume: true,
  deductMarksForWrong: false,
  hasOpenAttempt: true,
  canStart: true,
  windowOpen: true,
};
const attempt: StudentQuizAttempt = {
  attemptId: 7,
  attemptNumber: 1,
  title: introduction.title,
  instructions: introduction.instructions,
  durationSeconds: null,
  startedAt: new Date().toISOString(),
  savedAnswers: [{ questionId: 1, essayAnswer: "Previously saved response" }],
  loseFocusPolicy: "ignore",
  autoNextQuestion: false,
  showCalculator: false,
  deductMarksForWrong: false,
  allowResume: true,
  questions: [
    {
      id: 1,
      questionType: "essay",
      bodyRichText: "<p>Explain the experiment.</p>",
      marks: 6,
      options: [],
      blankIndexes: [],
      passage: { id: 4, title: "Experiment", bodyRichText: "<p>A shared passage.</p>" },
    },
    {
      id: 2,
      questionType: "fill_in_gap",
      bodyRichText: "<p>Force = [gap]</p>",
      marks: 4,
      options: [],
      blankIndexes: [1],
      passage: null,
    },
  ],
};
function mount(element = <QuizAttemptView quizId="9" />) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      {element}
    </QueryClientProvider>,
  );
}
function mockApi(started: StudentQuizAttempt = attempt) {
  apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/review?"))
      return {
        data: { title: introduction.title, status: "awaiting_grading", questions: [] },
      };
    if (init?.method === "PUT") return { data: { saved: true } };
    if (init?.method === "POST")
      return {
        data: { attemptId: 7, scoreStatus: "awaiting_grading", message: "Submitted" },
      };
    if (url.endsWith("/attempt")) return { data: started };
    return { data: introduction };
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
});

describe("student quiz integration", () => {
  it("shows instructions before starting and restores saved essays with their passage", async () => {
    mount();
    expect(
      await screen.findByText("Read carefully before starting."),
    ).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/quizzes/9/attempt");
    fireEvent.click(screen.getByRole("button", { name: "Resume attempt" }));
    expect(await screen.findByLabelText("Your response")).toHaveValue(
      "Previously saved response",
    );
    expect(screen.getByText("A shared passage.")).toBeInTheDocument();
    expect(screen.getByText("Manually graded")).toBeInTheDocument();
    expect(screen.getByText("No time limit", { exact: true })).toBeInTheDocument();
    expect(apiFetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
  it("saves gap and essay responses, then submits only after confirmation and shows the grading gate", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Resume attempt" }));
    fireEvent.change(await screen.findByLabelText("Your response"), {
      target: { value: "New essay response" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.change(screen.getByLabelText("Gap 1"), {
      target: { value: "mass × acceleration" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save progress" }));
    await waitFor(() =>
      expect(apiFetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit quiz" }));
    expect(apiFetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: /^Submit$/ }),
    );
    expect(
      await screen.findByText(
        "Your teacher will grade the essays before an Admin releases your result.",
      ),
    ).toBeInTheDocument();
    const call = apiFetch.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(call?.[1].body ?? "{}")).toEqual({
      answers: [
        { questionId: 1, essayAnswer: "New essay response" },
        { questionId: 2, blankAnswers: { "1": "mass × acceleration" } },
      ],
    });
    expect(screen.queryByText(/Score:/)).not.toBeInTheDocument();
  });
  it("uses the server start time to submit an expired seconds-based quiz", async () => {
    mockApi({
      ...attempt,
      durationSeconds: 1,
      startedAt: new Date(Date.now() - 5000).toISOString(),
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Resume attempt" }));
    expect(await screen.findByText("Submission received")).toBeInTheDocument();
    expect(
      apiFetch.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
  });
  it("warns on window focus loss without submitting", async () => {
    mockApi({ ...attempt, loseFocusPolicy: "warn" });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Resume attempt" }));
    await screen.findByLabelText("Your response");
    fireEvent.blur(window);
    expect(await screen.findByText("Stay on the quiz")).toBeInTheDocument();
    expect(apiFetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
  it("auto-advances after a single answer and renders rich options", async () => {
    mockApi({
      ...attempt,
      autoNextQuestion: true,
      savedAnswers: [],
      questions: [
        {
          ...attempt.questions[0],
          questionType: "options",
          options: [
            { id: 11, optionText: "<p><strong>True</strong></p>" },
            { id: 12, optionText: "<p>False</p>" },
          ],
        },
        attempt.questions[1],
      ],
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Resume attempt" }));
    fireEvent.click(await screen.findByRole("radio", { name: "A. True" }));
    expect(await screen.findByLabelText("Gap 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to question 2" })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });
  it("shows released pass/fail and answer explanations", async () => {
    apiFetch.mockResolvedValue({
      data: {
        title: introduction.title,
        status: "released",
        score: 75,
        passed: true,
        questions: [
          {
            id: 2,
            bodyRichText: "Force?",
            reasonRichText: "<p>Newton's second law.</p>",
            questionType: "fill_in_gap",
            correctOptions: [],
            acceptedAnswers: ["ma"],
          },
        ],
      },
    });
    mount(<QuizReview quizId="9" attemptId={7} />);
    expect(await screen.findByText("Score: 75% · Passed")).toBeInTheDocument();
    expect(screen.getByText("Newton's second law.")).toBeInTheDocument();
  });
});
