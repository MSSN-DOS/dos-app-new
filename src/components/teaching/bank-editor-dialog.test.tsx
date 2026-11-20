import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RichTextEditorProps } from "./rich-text-editor";
import { BankEditorDialog } from "./bank-editor-dialog";
import { newBuilderQuestion } from "@/lib/quizzes/builder";
import type { BankDocument } from "@/lib/validation/question-bank";
const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/auth/client-fetch", () => ({ apiFetch, ApiError: class extends Error {} }));
vi.mock("./use-authoring-subjects", () => ({ useAuthoringSubjects: () => ({ courses: [{ id: 3, code: "ENG", title: "Engineering" }], jambSubjects: [], isPending: false, isError: false, refetch: vi.fn() }) }));
vi.mock("./rich-text-editor", () => ({ RichTextEditor: ({ id, label, value, onChange, uploadImage }: RichTextEditorProps) => <div><label htmlFor={id}>{label}</label><input id={id} value={value} onChange={event => onChange(event.target.value)} /><button type="button" onClick={async () => { if (uploadImage) { const image = await uploadImage(new File(["synthetic"], "diagram.png", { type: "image/png" })); onChange(`${value}<img src="${image.url}" data-storage-path="${image.path}" alt="Diagram">`); } }}>Insert bank image</button></div> }));
let doc: BankDocument;
const path = "question-bank/1/abc-123.png";
beforeEach(() => {
  vi.clearAllMocks();
  doc = { id: 1, revision: 0, status: "draft", kind: "essay", courseId: 3, jambSubjectId: null, topicId: null, questions: [{ ...newBuilderQuestion("essay", "a"), id: 1, bodyRichText: "Explain" }], passages: [] };
  apiFetch.mockImplementation(async (url: string, init?: { method?: string; body?: unknown }) => {
    if (url.includes("question-images")) return init?.method === "POST" ? { data: { path, url: `https://example.supabase.co/storage/v1/object/sign/quiz-images/${path}?token=test` } } : { data: [] };
    if (url.includes("/topics")) return { data: [] };
    return { data: init?.method === "PUT" ? { ...doc, ...JSON.parse(String(init.body)).payload, revision: 1 } : doc };
  });
});
function mount() { const saved = vi.fn(); render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><BankEditorDialog open onOpenChange={vi.fn()} questionId={1} preset={doc.kind} onSaved={saved} /></QueryClientProvider>); return saved; }
describe("bank editor integration", () => {
  it("saves rich essay text with its revision and no automatic answer", async () => {
    const saved = mount(); const field = await screen.findByLabelText("Question 1");
    fireEvent.change(field, { target: { value: "<p>Updated explanation</p>" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    const body = JSON.parse(apiFetch.mock.calls.find(([, init]) => init?.method === "PUT")![1].body);
    expect(body.action).toBe("publish"); expect(body.revision).toBe(0);
    expect(body.payload.questions[0]).toMatchObject({ questionType: "essay", bodyRichText: "<p>Updated explanation</p>", options: [] });
  }, 30000);
  it("connects image insertion to the private upload endpoint and saved question", async () => {
    const saved = mount(); await screen.findByLabelText("Question 1");
    fireEvent.click(screen.getAllByRole("button", { name: "Insert bank image" })[0]);
    await waitFor(() => expect((screen.getByLabelText("Question 1") as HTMLInputElement).value).toContain("data-storage-path"));
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(apiFetch.mock.calls.find(([, init]) => init?.method === "POST")?.[1].body).toBeInstanceOf(FormData);
    expect(JSON.parse(apiFetch.mock.calls.find(([, init]) => init?.method === "PUT")![1].body).payload.questions[0].bodyRichText).toContain(path);
  }, 30000);
  it("adds a manually graded child to a shared passage and saves the whole group", async () => {
    doc = { ...doc, kind: "passage", passages: [{ clientKey: "p", id: 7, bodyRichText: "Shared text", title: "" }], questions: [{ ...doc.questions[0], passageKey: "p" }, { ...newBuilderQuestion("essay", "b", "p"), id: 2, bodyRichText: "Discuss" }] };
    const saved = mount(); await screen.findByLabelText("Shared passage");
    fireEvent.click(screen.getByRole("button", { name: "Add sub-question" }));
    fireEvent.click(within(screen.getAllByRole("dialog").at(-1)!).getByRole("button", { name: "Essay" }));
    expect(screen.getByLabelText("Question 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" })); await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    const payload = JSON.parse(apiFetch.mock.calls.find(([, init]) => init?.method === "PUT")![1].body).payload;
    expect(payload.questions).toHaveLength(3); expect(payload.questions[2]).toMatchObject({ questionType: "essay", passageKey: "p" });
    expect(payload.passages[0].bodyRichText).toBe("Shared text");
  }, 30000);
});
