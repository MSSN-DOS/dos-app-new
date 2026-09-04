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
- **Purpose:** Question bank editor — both question types, rich text, draft-vs-publish gating.

**Wireframe**
```
FRAME: Questions — List
  FIELD: Filter -> [ Course/Topic or JAMB Subject select ] [ Type: Fill-in-gap / Options ] [ Status: Draft / Published ]
  ACTION ROW: [+ New question]
  LIST ROW: "The powerhouse of the cell is the ____." | Fill-in-gap | Draft pill
  LIST ROW: "Salah is performed how many times daily?" | Options | Published pill

FRAME: Question Editor
  ACTION ROW: [Fill in the gap] [Options]  -- type toggle, only editable on a new question
  FIELD: Body -> [ rich text area: Bold / Sub / Superscript toolbar ]
  FIELD (Fill-in-gap): Accepted answer(s) -> [ one input per blank, "+ Add blank" ]
  FIELD (Options): Options -> [ radio-marked list, min 2, "+ Add option", radio marks the single correct one ]
  FIELD: Course/Topic or JAMB Subject -> [ select ]
  ACTION ROW: [Save as draft] [Publish: primary, disabled/greyed with tooltip if incomplete]
  NOTE: Publishing is blocked until question text and all required options/blanks are filled in.
```

**Data / API:** `GET/POST/PATCH/DELETE /api/teacher/questions`. Two Zod schemas per `AGENTS.md` §3 — lenient for draft-save, strict for publish. The "Publish" button's disabled state should reflect the *strict* schema's validity in real time, not just reject on click.

**States:** loading · empty · error · save-as-draft-always-available (even with an empty body — draft has no requirements) · publish-blocked (clear inline reason, e.g. "Add at least one correct option").

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

**Data / API:** `GET /api/teacher/quizzes?type=&courseId=`, `POST /api/teacher/quizzes` (creates a draft shell, redirects to the builder).

**States:** loading · empty · error.

---

### `/teacher/quizzes/[id]` — Quiz builder
- **Task:** P3-5
- **Purpose:** Attach questions from the bank, configure everything the quiz needs before publishing.

**Wireframe**
```
FRAME: Quiz Builder — "Course Quiz — Week 4"
  FIELD: Title -> [ text input ]
  FIELD: Instructions -> [ rich text: shown to student before starting ]
  FIELD: Question count -> [ fixed "50" and locked, if Course Quiz | free-form number input, if Topic Quiz ]
  FIELD: Time limit (minutes) -> [ number input ]
  FIELD: Pass mark -> [ number input, % ]
  FIELD: Multiple attempts allowed -> [ toggle ]
  FIELD: Lose-focus policy -> [ select: Ignore / Warn / Auto-submit ]
  FIELD (Course Quiz only): Week (Saturday date) -> [ date picker, constrained to Saturdays ]

FRAME: Attach Questions
  FIELD: Search/filter question bank -> [ by topic, type ]
  LIST ROW: question preview | [+ Add to quiz]
  LIST ROW (attached): question preview | [Remove]
  NOTE: N of {question_count} questions attached.

  ACTION ROW: [Save as draft] [Publish: primary, disabled until question_count is met and all required fields are valid]
```

**Data / API:** `GET/PATCH /api/teacher/quizzes/[id]`, `GET /api/teacher/questions?...` (for the attach-search), `POST/DELETE /api/teacher/quizzes/[id]/questions`.

**States:** loading · saving · error · publish-blocked (attached count ≠ required count, or a required field is empty — show which) · attach-search loading/empty.

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
