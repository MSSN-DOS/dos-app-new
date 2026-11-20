"use client";
import Image from "next/image";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
import { newBuilderQuestion, type BuilderQuestion } from "@/lib/quizzes/builder";
import { QUIZ_IMAGE_REFRESH_MS, quizImagePaths, refreshQuizRichText } from "@/lib/quizzes/images";
import { bankDocumentSchema, bankDraftSchema, bankImageLinksSchema, bankPublishSchema, bankSaveSchema, type BankDocument, type BankDraft, type BankQuestionKind } from "@/lib/validation/question-bank";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { RichTextEditor, type QuizImageUploader } from "./rich-text-editor";
import { BankTypeDialog, BANK_TYPE_LABELS } from "./bank-type-dialog";
import { useAuthoringSubjects } from "./use-authoring-subjects";

function initialDraft(kind: BankQuestionKind): BankDraft {
  const passageKey = kind === "passage" ? crypto.randomUUID() : null;
  return { kind, courseId: null, jambSubjectId: null, topicId: null,
    passages: passageKey ? [{ clientKey: passageKey, title: "", bodyRichText: "" }] : [],
    questions: passageKey ? [newBuilderQuestion("options", crypto.randomUUID(), passageKey), newBuilderQuestion("options", crypto.randomUUID(), passageKey)] : [newBuilderQuestion(kind === "passage" ? "options" : kind, crypto.randomUUID())],
  };
}
type Issue = { field: string; message: string };
function serverIssues(error: unknown): Issue[] {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return [];
  return error.details.flatMap((row: unknown) => typeof row === "object" && row !== null && "field" in row && "message" in row && typeof row.field === "string" && typeof row.message === "string" ? [{ field: row.field.replace(/^payload\./, ""), message: row.message }] : []);
}
function BankFields({ question, number, onChange, remove, uploadImage, issues }: { question: BuilderQuestion; number: number; onChange: (q: BuilderQuestion) => void; remove?: () => void; uploadImage: QuizImageUploader; issues: Issue[] }) {
  const [open, setOpen] = useState(true);
  const q = question; const prefix = `bank-${q.clientKey}`;
  const options = q.options ?? []; const blanks = q.blanks ?? [];
  const update = (patch: Partial<BuilderQuestion>) => onChange({ ...q, ...patch });
  const isTrueFalse = options.length === 2 && options[0].optionText.replace(/<[^>]*>/g, "").trim() === "True" && options[1].optionText.replace(/<[^>]*>/g, "").trim() === "False";
  const kind = isTrueFalse ? "true_false" : q.questionType;
  return <Collapsible open={open} onOpenChange={setOpen} className="min-w-0 overflow-hidden rounded-2xl border border-line bg-panel">
    <div className="flex items-center gap-3 border-b border-line p-3">
      <span className="text-base font-semibold text-ink">{number}.</span><Badge variant="secondary" className="text-sub">{BANK_TYPE_LABELS[kind]}</Badge>
      {q.questionType === "essay" && <Badge className="bg-success/10 text-ink">Manually graded</Badge>}
      <div className="ml-auto flex items-center gap-1">{remove && <Button type="button" variant="ghost" size="icon" aria-label={`Remove sub-question ${number}`} onClick={remove} className="text-ruby"><Trash2 /></Button>}
        <CollapsibleTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`${open ? "Collapse" : "Expand"} question ${number}`}><ChevronDown className={open ? "rotate-180" : ""} /></Button></CollapsibleTrigger>
      </div>
    </div>
    <CollapsibleContent className="space-y-5 p-3 sm:p-4">
      <RichTextEditor id={`${prefix}-body`} label={`Question ${number}`} value={q.bodyRichText} onChange={bodyRichText => update({ bodyRichText })} uploadImage={uploadImage} />
      {q.questionType === "options" && <section className="space-y-3" aria-label={`Options for question ${number}`}>
        <p className="text-base font-semibold text-ink">Options — select one correct answer</p>
        <RadioGroup value={String(options.findIndex(o => o.isCorrect))} onValueChange={value => update({ options: options.map((o, index) => ({ ...o, isCorrect: index === Number(value) })) })}>
          {options.map((option, index) => <div key={index} className="space-y-3 rounded-xl border border-line bg-canvas p-3">
            <div className="flex items-center justify-between gap-2"><span className="text-base font-semibold text-ink">{String.fromCharCode(65 + index)}</span>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-base text-ink"><RadioGroupItem value={String(index)} aria-label={`Select option ${String.fromCharCode(65 + index)} as answer for question ${number}`} />Select as answer</label>
              {!isTrueFalse && options.length > 2 && <Button type="button" variant="ghost" size="icon" aria-label={`Remove option ${String.fromCharCode(65 + index)} from question ${number}`} onClick={() => update({ options: options.filter((_, i) => i !== index) })}><Trash2 /></Button>}
            </div>
            {isTrueFalse ? <p className="text-base text-ink">{index === 0 ? "True" : "False"}</p> : <RichTextEditor id={`${prefix}-option-${index}`} label={`Option ${String.fromCharCode(65 + index)} for question ${number}`} value={option.optionText} onChange={optionText => update({ options: options.map((o, i) => i === index ? { ...o, optionText } : o) })} uploadImage={uploadImage} />}
          </div>)}
        </RadioGroup>
        {!isTrueFalse && <Button type="button" variant="outline" className="min-h-11 w-full border-dashed text-base" onClick={() => update({ options: [...options, { optionText: "", isCorrect: false }] })}><Plus />Add more option</Button>}
      </section>}
      {q.questionType === "fill_in_gap" && <section className="space-y-3"><p className="text-base text-sub">Use [gap] for each blank. Answers are trimmed and matched exactly, ignoring letter case.</p>
        {blanks.map((blank, index) => <div key={index} className="space-y-2"><Label htmlFor={`${prefix}-blank-${index}`}>Accepted answer {index + 1}</Label><div className="flex gap-2"><Input id={`${prefix}-blank-${index}`} maxLength={255} className="min-h-11 text-base" value={blank.acceptedAnswer} onChange={event => update({ blanks: blanks.map((b, i) => i === index ? { acceptedAnswer: event.target.value } : b) })} />{blanks.length > 1 && <Button type="button" variant="ghost" size="icon" aria-label={`Remove blank ${index + 1}`} onClick={() => update({ blanks: blanks.filter((_, i) => i !== index) })}><Trash2 /></Button>}</div></div>)}
        <Button type="button" variant="outline" className="min-h-11 border-dashed text-base" onClick={() => update({ blanks: [...blanks, { acceptedAnswer: "" }] })}><Plus />Add another blank</Button>
      </section>}
      {q.questionType === "essay" && <p className="text-base text-sub">The teacher reads the student&apos;s response and awards marks after submission.</p>}
      <RichTextEditor id={`${prefix}-reason`} label={`Reason / explanation for question ${number} (optional)`} value={q.reasonRichText ?? ""} onChange={reasonRichText => update({ reasonRichText })} uploadImage={uploadImage} />
      {issues.map(issue => <p key={`${issue.field}-${issue.message}`} role="alert" className="text-base text-ruby">{issue.message}</p>)}
    </CollapsibleContent>
  </Collapsible>;
}
function BankSession({ initial, id, revision, onSaved }: { initial: BankDraft; id?: number; revision: number; onSaved: (doc: BankDocument) => void }) {
  const [payload, setPayload] = useState(initial);
  const [track, setTrack] = useState(initial.jambSubjectId ? "jamb" : "course");
  const [childChooser, setChildChooser] = useState(false);
  const [deleting, setDeleting] = useState<{ child?: number; path?: string } | null>(null);
  const subjects = useAuthoringSubjects();
  const imageQuery = useQuery({ queryKey: ["bank-images", id ?? "new"], queryFn: async () => bankImageLinksSchema.parse((await apiFetch<{ data: unknown }>(`/teacher/question-images${id ? `?questionId=${id}` : ""}`)).data), refetchInterval: QUIZ_IMAGE_REFRESH_MS, refetchOnWindowFocus: true });
  const links = new Map(imageQuery.data?.map(image => [image.path, image.url] as const));
  const rich = (text: string) => refreshQuizRichText(text, links);
  const topics = useQuery({ queryKey: ["teacher", "topics", payload.courseId], enabled: track === "course" && Boolean(payload.courseId), queryFn: () => apiFetch<{ data: { id: number; title: string }[] }>(`/teacher/topics?courseId=${payload.courseId}`).then(r => r.data) });
  const upload = useMutation({ mutationFn: async (file: File) => { const body = new FormData(); body.append("file", file); return (await apiFetch<{ data: { path: string; url: string } }>("/teacher/question-images", { method: "POST", body })).data; }, onSuccess: () => { void imageQuery.refetch(); } });
  const save = useMutation({ mutationFn: async (action: "draft" | "publish") => {
    const body = bankSaveSchema.parse({ action, revision, payload });
    const result = await apiFetch<{ data: unknown }>(id ? `/teacher/questions/${id}/document` : "/teacher/questions/documents", { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
    return bankDocumentSchema.parse(result.data);
  }, onSuccess: doc => { toast.success(doc.status === "published" ? "Question published" : "Question saved as draft"); onSaved(doc); } });
  const removeImage = useMutation({ mutationFn: (path: string) => apiFetch<void>("/teacher/question-images", { method: "DELETE", body: JSON.stringify({ path }) }), onSuccess: () => { setDeleting(null); void imageQuery.refetch(); } });
  const validation = bankPublishSchema.safeParse(payload);
  const blockers: Issue[] = validation.success ? [] : validation.error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message }));
  const issues = [...blockers, ...serverIssues(save.error)];
  const updateQuestion = (index: number, q: BuilderQuestion) => setPayload(old => ({ ...old, questions: old.questions.map((current, i) => i === index ? q : current) }));
  const referenced = new Set([...payload.passages.map(p => p.bodyRichText), ...payload.questions.flatMap(q => [q.bodyRichText, q.reasonRichText ?? "", ...(q.options ?? []).map(o => o.optionText)])].flatMap(quizImagePaths));
  return <>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
      <section className="space-y-3" aria-label="Question subject"><p className="text-base font-semibold text-ink">Belongs to</p>
        <Tabs value={track} onValueChange={value => { setTrack(value); setPayload(old => ({ ...old, courseId: null, jambSubjectId: null, topicId: null })); }}><TabsList className="h-auto"><TabsTrigger value="course" className="min-h-11 text-base">Course / Topic</TabsTrigger><TabsTrigger value="jamb" className="min-h-11 text-base">JAMB subject</TabsTrigger></TabsList></Tabs>
        {subjects.isPending ? <p className="text-base text-sub">Loading subjects…</p> : subjects.isError ? <div role="alert"><p className="text-base text-ruby">Could not load your subjects.</p><Button type="button" variant="outline" onClick={() => subjects.refetch()}>Retry subjects</Button></div> : track === "course" ? <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="bank-course">Course</Label><Select value={payload.courseId ? String(payload.courseId) : ""} onValueChange={value => setPayload(old => ({ ...old, courseId: Number(value), topicId: null }))}><SelectTrigger id="bank-course" className="min-h-11 w-full text-base"><SelectValue placeholder="Choose a course" /></SelectTrigger><SelectContent>{subjects.courses.map(course => <SelectItem key={course.id} value={String(course.id)}>{course.code} — {course.title}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="bank-topic">Topic (optional)</Label><Select disabled={!payload.courseId || topics.isPending} value={payload.topicId ? String(payload.topicId) : "none"} onValueChange={value => setPayload(old => ({ ...old, topicId: value === "none" ? null : Number(value) }))}><SelectTrigger id="bank-topic" className="min-h-11 w-full text-base"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No topic</SelectItem>{topics.data?.map(topic => <SelectItem key={topic.id} value={String(topic.id)}>{topic.title}</SelectItem>)}</SelectContent></Select>{topics.isError && <Button type="button" variant="outline" onClick={() => topics.refetch()}>Retry topics</Button>}</div>
        </div> : <div className="space-y-2"><Label htmlFor="bank-subject">JAMB subject</Label><Select value={payload.jambSubjectId ? String(payload.jambSubjectId) : ""} onValueChange={value => setPayload(old => ({ ...old, jambSubjectId: Number(value) }))}><SelectTrigger id="bank-subject" className="min-h-11 w-full text-base"><SelectValue placeholder="Choose a subject" /></SelectTrigger><SelectContent>{subjects.jambSubjects.map(subject => <SelectItem key={subject.id} value={String(subject.id)}>{subject.name}</SelectItem>)}</SelectContent></Select></div>}
        {issues.filter(issue => !issue.field.startsWith("questions") && !issue.field.startsWith("passages")).map(issue => <p key={`${issue.field}-${issue.message}`} className="text-base text-ruby">{issue.message}</p>)}
      </section>
      {payload.passages.map((passage, index) => <section key={passage.clientKey} className="space-y-3 rounded-2xl border border-line bg-canvas p-4"><Label htmlFor="bank-passage-title">Passage title (optional)</Label><Input id="bank-passage-title" className="min-h-11 text-base" maxLength={200} value={passage.title ?? ""} onChange={event => setPayload(old => ({ ...old, passages: old.passages.map((p, i) => i === index ? { ...p, title: event.target.value } : p) }))} /><RichTextEditor id="bank-passage" label="Shared passage" value={rich(passage.bodyRichText)} onChange={bodyRichText => setPayload(old => ({ ...old, passages: old.passages.map((p, i) => i === index ? { ...p, bodyRichText } : p) }))} uploadImage={upload.mutateAsync} />{issues.filter(issue => issue.field.startsWith("passages")).map(issue => <p key={issue.field} className="text-base text-ruby">{issue.message}</p>)}</section>)}
      {payload.questions.map((q, index) => <BankFields key={q.clientKey} number={index + 1} question={{ ...q, clientKey: q.clientKey ?? `new-${index}`, bodyRichText: rich(q.bodyRichText), reasonRichText: rich(q.reasonRichText ?? ""), options: q.options?.map(o => ({ ...o, optionText: rich(o.optionText) })) }} onChange={next => updateQuestion(index, next)} remove={payload.kind === "passage" && payload.questions.length > 1 ? () => setDeleting({ child: index }) : undefined} uploadImage={upload.mutateAsync} issues={issues.filter(issue => issue.field === "questions" || issue.field.startsWith(`questions.${index}.`))} />)}
      {payload.kind === "passage" && <Button type="button" variant="outline" className="min-h-11 w-full border-dashed text-base" onClick={() => setChildChooser(true)}><Plus />Add sub-question</Button>}
      <Collapsible className="rounded-xl border border-line p-3"><CollapsibleTrigger asChild><Button type="button" variant="ghost" className="min-h-11 text-base">Uploaded images<ChevronDown /></Button></CollapsibleTrigger><CollapsibleContent className="space-y-3 pt-3">
        <p className="text-base text-sub">Insert images with the editor toolbar. PNG, JPEG or WebP, up to 5 MB.</p>
        {imageQuery.isError && <Button type="button" variant="outline" onClick={() => imageQuery.refetch()}>Retry image links</Button>}
        <div className="grid gap-3 sm:grid-cols-3">{imageQuery.data?.map(image => <div key={image.path} className="space-y-2 rounded-xl border border-line p-3"><Image src={image.url} alt="Uploaded question image" width={240} height={160} unoptimized className="h-28 w-full object-contain" /><Button type="button" variant="outline" className="min-h-11 w-full" disabled={referenced.has(image.path) || removeImage.isPending} onClick={() => setDeleting({ path: image.path })}>Remove upload</Button>{referenced.has(image.path) && <p className="text-base text-sub">Remove it from the editor and save before deleting the upload.</p>}</div>)}</div>
        {removeImage.isError && <p role="alert" className="text-base text-ruby">{removeImage.error.message}</p>}
      </CollapsibleContent></Collapsible>
      {save.isError && <p role="alert" className="rounded-xl border border-ruby/30 bg-ruby/10 p-3 text-base text-ruby">{save.error.message}</p>}
    </div>
    <footer className="shrink-0 space-y-3 border-t border-line bg-panel p-4 sm:px-6">
      {blockers.length ? <div aria-live="polite" className="text-base text-sub"><p className="font-semibold">{blockers.length} thing{blockers.length === 1 ? "" : "s"} needed before publishing</p><ul className="mt-1 max-h-28 list-disc overflow-y-auto pl-5">{blockers.map(issue => <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>)}</ul></div> : <p className="text-base text-ink">Ready to publish</p>}
      <div className="flex gap-3"><Button type="button" variant="outline" className="min-h-11 flex-1 text-base" disabled={save.isPending || upload.isPending || !bankDraftSchema.safeParse(payload).success} onClick={() => save.mutate("draft")}>{save.isPending ? "Saving…" : "Save as draft"}</Button><Button type="button" className="min-h-11 flex-1 text-base" disabled={save.isPending || upload.isPending || !validation.success} onClick={() => save.mutate("publish")}>Publish</Button></div>
    </footer>
    <BankTypeDialog open={childChooser} onOpenChange={setChildChooser} allowPassage={false} onChoose={kind => { if (kind !== "passage") setPayload(old => ({ ...old, questions: [...old.questions, newBuilderQuestion(kind, crypto.randomUUID(), old.passages[0].clientKey)] })); }} />
    <AlertDialog open={deleting !== null} onOpenChange={open => { if (!open) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{deleting?.path ? "Delete this unused upload?" : "Remove this sub-question?"}</AlertDialogTitle><AlertDialogDescription>{deleting?.path ? "The image will be removed from Storage. Saved references elsewhere prevent deletion." : "Save the passage to apply this change."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (deleting?.path) removeImage.mutate(deleting.path); else if (deleting?.child !== undefined) { setPayload(old => ({ ...old, questions: old.questions.filter((_, i) => i !== deleting.child) })); setDeleting(null); } }}>Remove</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
export function BankEditorDialog({ open, onOpenChange, preset, questionId, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; preset: BankQuestionKind; questionId?: number; onSaved: (doc: BankDocument) => void }) {
  const query = useQuery({ queryKey: ["bank-document", questionId], enabled: open && Boolean(questionId), refetchOnWindowFocus: false, queryFn: async () => bankDocumentSchema.parse((await apiFetch<{ data: unknown }>(`/teacher/questions/${questionId}/document`)).data) });
  const doc = query.data;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex max-h-[92dvh] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden rounded-2xl border border-line bg-panel p-0 text-ink sm:max-w-4xl">
    <DialogHeader className="shrink-0 border-b border-line px-4 py-4 pr-12 sm:px-6"><DialogTitle className="text-xl font-semibold">{questionId ? "Edit bank question" : `Add ${BANK_TYPE_LABELS[preset]} question`}</DialogTitle><DialogDescription className="text-base text-sub">Drafts can be incomplete. Publishing checks every required question and answer.</DialogDescription></DialogHeader>
    {questionId && query.isPending ? <p className="p-6 text-base text-sub">Loading question…</p> : questionId && query.isError && !doc ? <div role="alert" className="space-y-3 p-6"><p className="text-base text-ruby">{query.error.message}</p><Button type="button" variant="outline" onClick={() => query.refetch()}>Retry question</Button></div> : open && (!questionId || doc) ? <BankSession key={doc ? `${doc.id}-${doc.revision}` : preset} initial={doc ?? initialDraft(preset)} id={doc?.id} revision={doc?.revision ?? 0} onSaved={onSaved} /> : null}
  </DialogContent></Dialog>;
}
