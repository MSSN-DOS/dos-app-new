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
- **Task:** P4-3
- **Purpose:** The actual quiz-taking flow. One question at a time, timed, lose-focus-aware.

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

**Data / API:** `GET /api/quizzes/[id]/attempt` (start — server picks/shuffles questions if `allow_multiple_attempts`, returns quiz config + question set, starts the timer server-side too, not just client-side, so a refresh can't reset it), `POST /api/quizzes/[id]/attempt` (submit all answers at once, or consider autosave-per-answer if `PLAN.md` scope allows — MVP default is submit-on-finish only, per-answer autosave is not in `PLAN.md`, don't add it unprompted).

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

**Data / API:** `GET /api/me/attempts?type=&courseId=`. Response omits `score` entirely for held Course Quiz attempts (not just hides it) — Topic Quiz scores are always shown since they were never held to begin with (they don't feed anything that requires the release gate).

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
