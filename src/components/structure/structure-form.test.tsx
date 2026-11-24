import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StructureForm } from "./structure-form";
const fetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/client-fetch", () => ({ apiFetch: fetch }));
const root = {
  faculties: [{ id: 1, name: "Engineering" }],
  departments: [],
  levels: [],
  departmentLevels: [],
  sessions: [],
};
beforeEach(() => vi.clearAllMocks());
it("requires explicit discard after editing and keeps edits when cancelled", async () => {
  const close = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StructureForm
        kind="faculty"
        preset={{}}
        root={root}
        onClose={close}
        onSaved={vi.fn()}
      />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Arts" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
  expect(screen.getByLabelText("Name")).toHaveValue("Arts");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Discard changes",
    }),
  );
  expect(close).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
});
it("retains entered values and shows server errors after a rejected save", async () => {
  fetch.mockRejectedValue(new Error("Faculty already exists"));
  const close = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StructureForm
        kind="faculty"
        preset={{}}
        root={root}
        onClose={close}
        onSaved={vi.fn()}
      />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Engineering" } });
  fireEvent.click(screen.getByRole("button", { name: "Save faculty" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Faculty already exists");
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Name")).toHaveValue("Engineering");
});
