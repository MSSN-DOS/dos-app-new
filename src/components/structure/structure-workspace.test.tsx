import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StructureWorkspace } from "./structure-workspace";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => mocks.params,
}));
vi.mock("@/lib/auth/client-fetch", () => ({ apiFetch: mocks.fetch }));
vi.mock("@/components/teaching/catalog-details", () => ({
  CatalogDetails: ({
    pagination,
  }: {
    pagination: { onChange: (key: string, page: number) => void };
  }) => (
    <div>
      <button onClick={() => pagination.onChange("topicPage", 2)}>Next topic page</button>
      <button onClick={() => pagination.onChange("quizPage", 3)}>Next quiz page</button>
    </div>
  ),
}));
const root = {
  faculties: [{ id: 1, name: "Engineering" }],
  departments: [{ id: 2, name: "Materials", facultyId: 1 }],
  levels: [{ id: 4, value: 400 }],
  departmentLevels: [{ departmentId: 2, levelId: 4 }],
  sessions: [
    { id: 1, label: "2025/26" },
    { id: 2, label: "2026/27" },
  ],
};
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <StructureWorkspace />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = new URLSearchParams();
  mocks.fetch.mockImplementation(async (path: string) => {
    if (path.includes("mode=root")) return { data: root };
    if (path.includes("mode=record"))
      return {
        data: {
          id: 7,
          code: "MME 471",
          title: "Metal forming",
          scopeType: "department",
          departmentId: 2,
          sessionId: 2,
          levelId: 4,
          semester: "harmattan",
        },
      };
    return { data: { nodes: [], hasMore: false } };
  });
});
it("shows the real structure in the existing theme and provides mobile tools", async () => {
  mount();
  await screen.findByRole("heading", { name: "Structure" });
  expect(
    screen.getByRole("navigation", { name: "Academic structure" }),
  ).toBeInTheDocument();
  const tools = screen.getByRole("navigation", { name: "Structure tools" });
  for (const name of ["Browse", "Search", "Setup", "New"])
    expect(within(tools).getByRole("button", { name })).toHaveClass("min-h-14");
  expect(mocks.fetch).toHaveBeenCalledWith("/admin/structure/workspace?mode=root");
  expect(mocks.fetch.mock.calls.some(([p]) => p.includes("mode=branch"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Expand Engineering" }));
  await waitFor(() =>
    expect(
      mocks.fetch.mock.calls.some(([p]) => p.includes("mode=branch&kind=faculty&id=1")),
    ).toBe(true),
  );
});
it("preserves independent pagination in shareable URLs", async () => {
  mocks.params = new URLSearchParams("kind=course&id=7&session=2&quizPage=2");
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Next topic page" }));
  expect(mocks.push).toHaveBeenLastCalledWith(
    "/admin/structure?kind=course&id=7&session=2&quizPage=2&topicPage=2",
    { scroll: false },
  );
  fireEvent.click(screen.getByRole("button", { name: "Next quiz page" }));
  expect(mocks.push).toHaveBeenLastCalledWith(
    "/admin/structure?kind=course&id=7&session=2&quizPage=3",
    { scroll: false },
  );
});
it("corrects a mismatched direct-link session and offers contextual creation", async () => {
  mocks.params = new URLSearchParams("kind=course&id=7&session=1");
  mount();
  await screen.findByRole("button", { name: "New topic" });
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith(
      "/admin/structure?kind=course&id=7&session=2",
      { scroll: false },
    ),
  );
});
it("keeps failed deletion open with the reference-block message", async () => {
  mocks.params = new URLSearchParams("kind=course&id=7");
  const original = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((path: string, options?: { method: string }) =>
    options?.method === "DELETE"
      ? Promise.reject(new Error("Course has quizzes and cannot be deleted"))
      : original(path, options),
  );
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: /Delete/ }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Course has quizzes",
  );
  expect(mocks.push).not.toHaveBeenCalled();
});
it("reports load failures with a retry action", async () => {
  mocks.fetch.mockRejectedValue(new Error("Unable to load structure"));
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load structure");
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
});
