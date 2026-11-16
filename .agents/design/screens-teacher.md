# Screen Specs — Teacher

All screens in this file: **Guard:** `role = teacher`. Live under a `(teacher)` layout with a persistent nav (Dashboard, Topics, Questions, Quizzes, Results) — build the shell once (P2-2).

---

### `/teacher` — Dashboard
- **Task:** part of P2-2 (shell), no dedicated content task — kept intentionally minimal for MVP.
- **Purpose:** Landing screen. Lighter than Admin's — a Teacher's real work happens on the Questions/Quizzes screens, not here.

**Wireframe**
```
FRAME: Teacher — Dashboard
  STAT ROW: [ Questions authored: N ] [ Quizzes published: N ]
  LIST ROW: Recently published quiz | course | status pill
  ACTION ROW: [+ New question] [+ New quiz]
```

**Data / API:** `GET /api/teacher/dashboard` — counts scoped to `created_by = current teacher`.

**States:** loading · empty (brand new Teacher account, nothing authored yet — this is a real first-run state, not an edge case) · error.

---

### `/teacher/topics`
- **Task:** P3-1
- **Purpose:** Create Topics under a Course. Both Admin and Teacher can do this (`DESIGN.md` §3).

**Wireframe**
```
FRAME: Topics
  FIELD: Course -> [ select ]
  ACTION ROW: [+ Add topic]
  LIST ROW: Trigonometry | MAT 101 | [Edit] [Delete]
  LIST ROW: Mass Transfer | CHE 301 | [Edit] [Delete]
```

**Data / API:** `GET/POST/PATCH/DELETE /api/teacher/topics?courseId=`. Delete should warn if any quiz/question references the topic.

**States:** loading · empty ("No topics yet for this course") · error · course-not-selected (prompt to pick a course before the list/add action is usable).

---

### `/teacher/questions`
- **Task:** P3-3 (UI), built on P3-2's draft/publish validation split.
- **Purpose:** Question bank editor — five authoring types, rich text, draft-vs-publish gating.

**P14 amendment (2026-11-15, supersedes the two-type wireframe below):** shared
with `/admin/questions`. New question opens the supplied rounded icon-card chooser:
True or False, Multiple choice, Fill in the gap, Passage and Essay. Two columns
on larger screens with Essay spanning both; one scrollable column on phones.
All choices are enabled; Essay is labelled "Manually graded". No Audio type.

The editor reuses Tiptap/KaTeX for stems, options, explanations and shared passage
text. Passage children are collapsible, support the four individual types and
require confirmation before removal. True/False has two fixed options; other
options are editable rich text with one correct answer. Gap answers use `[gap]`
and trimmed, case-insensitive exact matching. Essays are graded by teachers in
the quiz grading screen. The footer lists strict publishing blockers and offers
Save as draft / Publish. Existing bulk entry and science symbol palettes remain.

**P14 APIs:** `POST /api/teacher/questions/documents`,
`GET/PUT/DELETE /api/teacher/questions/[id]/document`,
`GET/POST/DELETE /api/teacher/question-images`. Document saves carry a revision;
stale saves and referenced-question changes return conflicts. Images are private,
author-owned PNG/JPEG/WebP uploads up to 5 MB, with signed-link renewal and
reference-aware removal. List requests use `groupPassages=1` to show a passage
once and distinguish True/False. `POST /api/teacher/quizzes/[id]/bank-copy` copies
the whole group and images independently into a draft quiz. All requests use
TanStack Query and `apiFetch`; server guards enforce role, ownership and subject
assignment. Both themes use the existing tokens and controls have 44px targets.

**Wireframe**
```
FRAME: Questions — List
  FIELD: Filter -> [ Course/Topic or JAMB Subject select ] [ Type: Fill-in-gap / Options ] [ Status: Draft / Published ]
  ACTION ROW: [+ New question]
  LIST ROW: "The powerhouse of the cell is the ____." | Fill-in-gap | Draft pill
  LIST ROW: "Salah is performed how many times daily?" | Options | Published pill

FRAME: Type chooser (dialog, shown first when adding — skipped when editing an existing question)
  ACTION CARD: [Fill in the gap]  "A sentence with one or more blanks. Graded on an exact, case-insensitive match."
  ACTION CARD: [Multiple choice]  "One question with two or more options. Exactly one is marked correct."
  NOTE: Question type is fixed after save — hence it's chosen before the editor opens, not toggled inside it.

FRAME: Question Editor (single scroll region + sticky footer)
  HEADER: [ ordinal badge: "+" for new / "#{id}" when editing ] · "Add a question" | "Question #{id}"
          · type chip [Fill-in-gap | Options] · [Change type] (new questions only — reopens the chooser)
  FIELD: Question text -> [ rich text area: Bold / Italic / Underline / Sub / Sup / bullet + grouped science symbol toolbars ]
  FIELD (Fill-in-gap): Accepted answers -> [ numbered badge + input per blank, dashed "Add another accepted answer" ]
  FIELD (Options): Options -> [ letter-badged A–H row + input; correct row is brand-tinted with a filled "CORRECT" chip,
          every other row shows "SELECT AS ANSWER"; dashed "Add new option", min 2 ]
  FIELD: Belongs to -> [ Course / Topic | JAMB subject ] toggle, then the matching select(s)
  FOOTER (sticky): blocker summary -> ["N things needed before publishing" + the list | "Ready to publish"] · [Save as draft] [Publish]
  NOTE: Publishing is blocked until question text and all required options/blanks are filled in. Publish stays disabled for the whole time a blocker exists, and the blocker list is always visible next to it — the reason is never hidden in a tooltip.
```

**Data / API:** `GET/POST/PATCH/DELETE /api/teacher/questions`. Two Zod schemas per `AGENTS.md` §3 — lenient for draft-save, strict for publish. The "Publish" button's disabled state should reflect the *strict* schema's validity in real time, not just reject on click.

**States:** loading · empty · error · save-as-draft-always-available (even with an empty body — draft has no requirements) · publish-blocked (the sticky footer names each missing item in a list; no tooltip-only reason).

**Visual reference:** question authoring follows the QuizBoot authoring flow (type chooser first, letter-badged options with an explicit "select as answer" affordance, dashed add-row, sticky action footer). Expressed in the existing `--dos-*` tokens only — no new palette, no raw colour values.

---

### `/teacher/quizzes`
- **Task:** P3-4
- **Purpose:** List + create Topic and Course quizzes.

**Wireframe**
```
FRAME: Quizzes
  FIELD: Filter -> [ Type: Topic / Course ] [ Course or JAMB Subject select ]
  ACTION ROW: [+ New quiz]
  LIST ROW: "Mass Transfer — Practice" | Topic Quiz | CHE 301 | Draft pill | [Edit]
  LIST ROW: "Course Quiz — Week 4" | Course Quiz | CHE 301 | Published pill | [Edit]

FRAME: New Quiz (modal, then routes to /teacher/quizzes/[id] for full config)
  ACTION ROW: [Topic Quiz] [Course Quiz]  -- type choice
  FIELD: Course or JAMB Subject -> [ select ]
  FIELD (Topic Quiz only): Topic -> [ select ]
  ACTION ROW: [Create & continue: primary]
```

**P12-10 amendment (2026-11-16):** shared with `/admin/quizzes`. The Teacher header
uses compact icon links with screen-reader labels below 960px to prevent tablet
overflow. Compact linked
rows wrap title, type, subject, question count and status on phones; column labels
appear on desktop. Search and All / Course / Topic / Drafts tabs combine with a
course filter before pagination. New Quiz uses a bottom sheet on phones and a
centered dialog on larger screens, with labelled 44px inputs and choices. Subject
and topic loading/errors have retry controls. JAMB uses Course Quiz because topics
are course-scoped. No visibility, payment, social or upgrade controls are added.

**Data / API:** `GET /api/teacher/quizzes?search=&type=&status=&courseId=&page=&pageSize=`, `POST /api/teacher/quizzes` (creates a draft shell, redirects to the builder). Shared Zod filters validate requests; search matches literal title text and preserves teacher ownership.

**States:** loading · empty · error.

---

### `/teacher/quizzes/[id]` — Quiz builder
- **Task:** P3-5, rebuilt in P12-8 (also used at `/admin/quizzes/[id]`).
- **Purpose:** Write quiz details and questions, configure settings, preview the student experience, and save a draft or publish.

**Wireframe**
```
FRAME: Quiz Builder — Draft / Published                         [Preview]
  DETAILS: optional cover (drop/upload/preview/replace/remove)
           required short title; rich description and instructions
           optional duration (hours / minutes / seconds); pass mark (60%)
  QUESTIONS: total marks [Apply]; [Add from question bank]; [Add new question]
             collapsible numbered cards; choose type in a dialog
             True/False | Multiple choice | Fill in gap | Passage | Essay
             question/options/explanation rich text; correct answer; marks
             select/bulk delete, duplicate, drag/keyboard/move-button order
  SETTINGS: searchable collapsible groups; pin to top; save personal defaults
            attempt rules, signed-in access, scoring/results, WAT schedule
  ERRORS: inline messages and a list of publishing blockers
  STICKY ACTIONS: [Save draft] [Publish]
  PUBLISHED: read-only authoring; essay grading (teacher/Admin)
```

**Data / API:** `GET/PUT /api/teacher/quizzes/[id]/builder` (shared draft/publish Zod, revision conflicts), `GET/POST/DELETE /api/teacher/quizzes/[id]/images` (private uploads, removal and owner-scoped signed-link renewal), `GET/PUT /api/teacher/quiz-preferences`, `GET /api/teacher/questions?...` and question detail for bank copies, `GET/PATCH /api/teacher/quizzes/[id]/grading`. Client requests use TanStack Query and `apiFetch`. Image links renew every eight minutes without replacing unsaved text, local uploads or the editor's draft state. Referenced images cannot be removed; unused replaced covers can be removed after publishing.

**States:** loading/retry, empty questions with CTA, uploading/error, saving/saved/error, invalid draft fields, strict publish blockers, stale-revision conflict, preview introduction/questions/completion, published lock, essay-grading loading/empty/error/saving. Course Quizzes still require exactly 50 questions; passages count their sub-questions. Drafts tolerate unfinished questions and schedules.

**P12-10 layout amendment (2026-11-16):** Questions / Settings / Results shadcn
tabs preserve the draft payload outside tab content. Questions shows a live count,
marks and exact duration summary above the cards on phones, alongside them on
desktop. Saved cards start collapsed; new cards expand, with separate wrapping
reorder/duplicate/delete actions. Settings holds details and the grouped settings
panel. Results embeds `GET /api/teacher/results/[quizId]` and manual essay grading
for published quizzes; drafts show an empty state. Admin availability controls stay
under Settings. The shared Add Question chooser has a fixed header and scrolling
single column on phones, two columns in a centered desktop dialog, safe-area
padding, a 44px close control and the manually graded Essay badge. The question-bank
picker also uses a phone sheet. Save draft / Publish sits above mobile navigation.

**Layout/accessibility:** single column on phones, enhanced at larger widths. All controls have labels, focus states and 44px targets; dialogs use shadcn focus management. Reorder has keyboard sensors and explicit move buttons. Rich text reuses Tiptap/KaTeX with full formatting, safe private images and fullscreen editing. Both themes use the existing tokens. Signed-in-only access is fixed; Public/Private controls are omitted. Results remain held until manual grading finishes and an Admin releases them. No premium, payment, social, AI-banner or add-on UI.

---

### `/teacher/results/[quizId]`
- **Task:** P3-6 area (results view specifically not separately ID'd in `PLAN.md` — build alongside P3-5/P3-6, it's a natural pairing)
- **Purpose:** Performance of students/aspirants who took one specific quiz this Teacher created.

**Wireframe**
```
FRAME: Results — "Course Quiz — Week 4" (CHE 301)
  STAT ROW: [ Attempts: N ] [ Avg score: N% ] [ Pass rate: N% ]
  LIST ROW: Bello, A. | Best score: 82% | Released pill / Held pill
  LIST ROW: Yusuf, F. | Best score: 64% | Held pill
```

**Data / API:** `GET /api/teacher/results/[quizId]` — scoped to `quizzes.created_by = current teacher`, 403 if the quiz belongs to someone else.

**States:** loading · empty (no attempts yet) · error. Released/held status is informational only here — Teachers don't have a release action, that's Admin-only (`DESIGN.md` §4).
