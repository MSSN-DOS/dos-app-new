# Screen Specs — Student

All screens in this file: **Guard:** `role = student`, and `student_profiles` row must exist (redirect to `/onboarding` otherwise). Live under a shell with a persistent nav (Dashboard, History, Resources) — build once, part of P2-2.

---

### `/dashboard`
- **Task:** P5-4
- **Purpose:** Home screen — CGPA, registered-as summary, semester indicator, and both quiz lists (Topic + Course).

**Wireframe**
```
FRAME: Student — Dashboard
  STAT ROW: [ CGPA (this week) ] [ Quizzes taken ]
  FIELD: Registered as -> Matric Number · Name · Faculty · Department · Level (display only)
  ROW: [ Harmattan pill (active/inactive) ] [ Rain pill (active/inactive) ]

  LIST SECTION: Topic Quizzes — practice, doesn't count
    LIST ROW: CHE 301 — Topic: Mass Transfer | Open pill -> links to attempt

  LIST SECTION: Course Quiz — weekly, counts toward CGPA
    LIST ROW: CHE 301 — Week 4 (50 questions) | Open pill
    LIST ROW: GNS 301 (General) — Week 3 | Score pending pill  -- held, not yet released
```

**Data / API:** `GET /api/me` (profile + CGPA summary), `GET /api/quizzes` (server-scoped to this student's Faculty/Department/Level + active semester, per `DESIGN.md` §9). CGPA value comes from the most recent *released* `cgpa_records` row — if none released yet, show "—" not "0.00," a zero reads as a real bad score.

**States:** loading (skeleton stat cards + list) · empty (no quizzes available this week — a real, expected state some weeks) · error.

---

### `/quizzes/[id]/attempt`
- **Task:** P4-3, extended in P12-8.
- **Purpose:** Read the introduction before starting; take one question at a time with optional timing, saved progress and configured review behavior.

**Wireframe**
```
FRAME: Quiz Attempt — "CHE 301 — Week 4"
  STAT ROW: [ Q 6 / 50 ] [ 08:42 remaining ]

  -- Options question:
  FIELD: Question body (rendered rich text) -> [ ○ Option A  ○ Option B  ○ Option C ]

  -- Fill-in-the-gap question:
  FIELD: Question body with blank rendered inline -> [ text input ]

  ACTION ROW: [Previous] [Next question: primary]
  NOTE (last question only): [Submit quiz: primary] instead of "Next"
  NOTE: Best of all attempts is kept as the recorded score.
```

**Data / API:** `GET /api/quizzes/[id]` returns the introduction (cover, description, instructions, duration, marks, attempt/window eligibility) without creating an attempt. Explicit Start/Resume calls `GET /api/quizzes/[id]/attempt`; server ordering/shuffling is stable for the attempt, passage children stay together, and resume restores saved responses and the original start time. `PUT /api/quizzes/[id]/attempt` saves progress for the approved resume setting (debounced and explicit Save progress). Saves are serialized; submission waits for outstanding saves. `POST` submits all responses after confirmation, or when the seconds-based timer expires. `GET /api/quizzes/[id]/review?attemptId=` returns only the caller's submitted attempt, with answers/explanations and score/pass-fail gated server-side.

**P12 behavior:** shared rich-text renderer supports equations, images and rich options; True/False and multiple choice use a single-answer radio group, gaps use trimmed case-insensitive exact matching, passages repeat above their children, essays use a labelled textarea and manual-grading badge. Optional calculator and automatic next-question setting apply during attempts. Null duration is untimed. Focus loss permits ignore or warns for new quizzes; legacy auto-submit remains supported. Answer navigation and submission have 44px keyboard-accessible targets. Results show awaiting-grading, held, released or hidden status. Configured question marks determine percentages; incorrect objective answers optionally deduct full marks, unanswered earn zero, and percentages cannot fall below zero.

**Review page (P12-8):** `/quizzes/[id]/review/[attemptId]`, linked from History, uses the same gated review component as submission. Loading, retry, awaiting grading, held, hidden, released score/pass-fail, answer/explanation and empty-review states are shared. This page lives under the existing Student/Aspirant role and onboarding guards.

**States:** loading (fetching questions) · in-progress · time-expiring warning (e.g. last 60 seconds, visual only, per the quiz's `lose_focus_policy` if it's `warn`) · lose-focus triggered (behavior branches on `lose_focus_policy`: `ignore` = do nothing, `warn` = show a modal warning, `auto_submit` = submit immediately with whatever's answered) · submitting · submitted (redirect to `/history` or a lightweight "submitted, score pending release" confirmation — never show the score here even momentarily, since it may be held) · error (e.g. time ran out server-side, quiz window closed mid-attempt — Course Quiz window is Sat 00:00–Sun 23:59, handle the edge case of an attempt in progress when the window closes).

**Notes:** This is the highest-stakes screen for the held-score rule (`DESIGN.md` §4, `AGENTS.md` §3) — verify with a direct API test, not just UI inspection, that the submit response never includes the raw score.

---

### `/history`
- **Task:** P4-4
- **Purpose:** Past attempts across all quizzes, with honest held/released status.

**Wireframe**
```
FRAME: History
  FIELD: Filter -> [ Course select ] [ Type: Topic / Course ]
  LIST ROW: CHE 301 — Week 4 | Course Quiz | attempted Aug 20 | Score pending pill
  LIST ROW: CHE 301 — Topic: Mass Transfer | Topic Quiz | attempted Aug 18 | 88% (practice, doesn't count toward CGPA)
```

**Data / API:** `GET /api/me/attempts?type=&courseId=`. Response omits `score` entirely for held attempts. Topic Quizzes also preserve the Admin release gate, while remaining excluded from CGPA calculations.

**States:** loading · empty ("You haven't taken any quizzes yet") · error.

---

### `/resources`
- **Task:** P6-3
- **Purpose:** Browse PDFs/articles scoped to the Student's structure.

**Wireframe**
```
FRAME: Resources
  FIELD: Filter -> [ Course select, defaults to all courses in scope ]
  LIST ROW: "Week 4 Reading" (PDF) | CHE 301 | [Download]
  LIST ROW: "Understanding Reaction Kinetics" (Article) | CHE 301 | [Read] -> expands inline or routes to a reader view
```

**Data / API:** `GET /api/resources` — server-scoped the same way `/api/quizzes` is (Faculty/Department/Level/active-Semester).

**States:** loading · empty ("No resources posted yet for your courses") · error.
