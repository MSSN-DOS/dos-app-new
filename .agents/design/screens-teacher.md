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

### Former Questions page

`/teacher/questions` and `/admin/questions` redirect to the respective Quizzes list.
Create or bulk-add questions inside the quiz builder. The builder can still copy
existing published bank questions, passages and private images into drafts.

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

FRAME: New Quiz (sheet on phones, centred dialog from md up, then routes to /teacher/quizzes/[id] for full config)
  SECTION "Quiz basics": Title -> [ text ]; Quiz type -> [Course | Topic]
  SECTION "Scope & schedule": For -> [Students | Aspirants] (course only)
                              Course / JAMB Subject -> [ select ]
                              Topic -> [ select ] (Topic Quiz only)
                              Week -> [ date, prefilled to the next Saturday ]
  SUMMARY: title | scope line | "Question builder opens next"
  ACTION ROW: [Cancel] [Create & continue: primary]
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

**Create-flow pass (2026-11-19):** the sheet was rebuilt in the Quizboot two-section
shape — brand header, numbered "Quiz basics" and "Scope & schedule" sections,
segmented quiz-type and academic-track radios with arrow-key navigation, the weekly
Course Quiz preselected with `weekStart` on the next Saturday, a live summary card
and a sticky Cancel / Create footer. Choosing Topic forces course scope and clears
any JAMB subject, so the impossible Topic + Aspirant combination is unreachable.
Readiness reuses `quizCreateSchema` instead of a hand-written check, and catalogue
and topic failures each carry their own Retry. Component tests live in
`new-quiz-dialog.test.tsx`.

**Data / API:** `GET /api/teacher/quizzes?search=&type=&status=&courseId=&page=&pageSize=`, `POST /api/teacher/quizzes` (creates a draft shell, redirects to the builder). Shared Zod filters validate requests; search matches literal title text and preserves teacher ownership.

**States:** loading · empty · error.

---

### `/teacher/quizzes/[id]` — Quiz builder
- **P12-11 expansion:** Add question is a floating shadcn dropdown containing the
  five existing authoring types plus Multi-answer, Numeric, Question bank and Bulk
  paste. All entries must lead to functional editors/actions. New quiz keeps the
  responsive create sheet and DOS's required academic fields. Drafts autosave with
  real status and no lost edits; title is editable in the header. Add question-level
  shuffle, limited attempts, math/chemistry palettes, released-data charts and
  durations, and a teacher-only question-paper view with Print/PDF and answer key.
  Unpublish hides new access, lets started attempts finish, and permanently locks
  attempted questions/settings. Republish restores access to the same content.
  The updated spec uses one active-field toolbar, inline gap answer boxes, editable
  science slots, More/Advanced panels, and paginated A4 papers with direct PDF download.
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
