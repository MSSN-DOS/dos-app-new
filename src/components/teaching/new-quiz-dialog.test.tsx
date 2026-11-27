import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewQuizForm } from "./new-quiz-dialog";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  push: vi.fn(),
  refetchSubjects: vi.fn(),
  subjects: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/components/teaching/use-authoring-subjects", () => ({
  useAuthoringSubjects: () => mocks.subjects(),
}));

vi.mock("@/lib/auth/client-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/auth/client-fetch")>()),
  apiFetch: mocks.apiFetch,
}));

vi.mock("@/lib/quizzes/saturday", async (original) => ({
  ...(await original<typeof import("@/lib/quizzes/saturday")>()),
  nextSaturday: () => "2026-11-21",
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <NewQuizForm basePath="/admin/quizzes" onDone={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  mocks.subjects.mockReturnValue({
    courses: [{ id: 10, code: "MAT 101", title: "General Mathematics" }],
    jambSubjects: [{ id: 20, name: "Mathematics" }],
    isPending: false,
    isError: false,
    refetch: mocks.refetchSubjects,
  });
  mocks.apiFetch.mockResolvedValue({ id: 41 });
});

describe("new quiz setup", () => {
  it("starts on Topic Quiz with the course track", () => {
    mount();

    expect(screen.getByRole("radio", { name: /Topic/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.queryByRole("radio", { name: /Aspirants/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Week starts")).not.toBeInTheDocument();
    expect(screen.getByText("Course topic")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create & continue/ })).toBeDisabled();
  });

  it("never leaves Topic Quiz in the impossible JAMB track", () => {
    mount();

    fireEvent.click(screen.getByRole("radio", { name: /^Course/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Aspirants/ }));
    expect(screen.getByRole("combobox", { name: "JAMB subject" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Topic/ }));

    expect(screen.queryByRole("radio", { name: /Aspirants/ })).not.toBeInTheDocument();
    expect(screen.getByText("Course topic")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Course" })).toBeInTheDocument();
  });

  it("supports arrow-key navigation in segmented choices", () => {
    mount();

    fireEvent.keyDown(screen.getByRole("radio", { name: /Topic/ }), {
      key: "ArrowLeft",
    });

    expect(screen.getByRole("radio", { name: /Course/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("creates the draft with the selected DOS academic scope", async () => {
    mount();
    fireEvent.click(screen.getByRole("radio", { name: /^Course/ }));

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "MAT 101 · Week 4" },
    });
    fireEvent.click(screen.getByRole("combobox", { name: "Course" }));
    fireEvent.click(
      screen.getByRole("option", { name: "MAT 101 — General Mathematics" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Create & continue/ }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/admin/quizzes/41"));
    const createCall = mocks.apiFetch.mock.calls.find(
      ([url]) => url === "/teacher/quizzes",
    );
    expect(createCall).toBeDefined();
    expect(JSON.parse(createCall?.[1]?.body as string)).toEqual({
      title: "MAT 101 · Week 4",
      quizType: "course",
      courseId: 10,
      jambSubjectId: null,
      topicId: null,
      weekStart: "2026-11-21",
    });
  });

  it("offers an explicit retry when the academic catalogue fails", () => {
    mocks.subjects.mockReturnValue({
      courses: [],
      jambSubjects: [],
      isPending: false,
      isError: true,
      refetch: mocks.refetchSubjects,
    });
    mount();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The academic catalogue could not be loaded.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetchSubjects).toHaveBeenCalledOnce();
  });
});
