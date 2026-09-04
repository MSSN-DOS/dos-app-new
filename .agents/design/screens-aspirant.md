# Screen Specs — Aspirant

All screens in this file: **Guard:** `role = aspirant`, and `aspirant_profiles` row must exist (redirect to `/onboarding` otherwise). Same shell pattern as Student, nav items: Dashboard, History, Resources.

These four mirror the Student screens closely — same components, different data shape (JAMB subject instead of Course/Faculty/Department/Level/Semester, Post-UTME instead of CGPA). Consider sharing components between the two role's screens (`<QuizList>`, `<AttemptFlow>`, `<HistoryList>`, `<ResourceList>`) with a `track: 'student' | 'aspirant'` prop, rather than duplicating four screens' worth of UI — the differences are in data scoping, not layout.

---

### `/dashboard`
- **Task:** P5-5
- **Purpose:** Home screen — Post-UTME score, registered-as summary, JAMB-subject quiz list. No semester indicator (Aspirants sit outside the semester structure entirely, `DESIGN.md` §3).

**Wireframe**
```
FRAME: Aspirant — Dashboard
  STAT ROW: [ Post-UTME score (converted) ] [ Quizzes taken ]
  FIELD: Registered as -> JAMB Reg Number · Name · Aspiring: <department of aspiration> (display only)

  LIST SECTION: Available quizzes — by JAMB subject
    LIST ROW: Physics | Open pill
    LIST ROW: Use of English | Open pill

  NOTE: Leaderboard is not visible on this account — admin view only.
```

**Data / API:** `GET /api/me` (profile + Post-UTME summary), `GET /api/quizzes` (server-scoped to all JAMB subjects — Aspirants see every subject, no filtering, per `DESIGN.md` §3). Post-UTME shows "—" if nothing released yet, same rule as Student CGPA.

**States:** loading · empty · error.

---

### `/quizzes/[id]/attempt`
- **Task:** P4-3 (shared build with Student — see note at top of this file)
- **Purpose:** Identical flow to the Student version. JAMB-subject quizzes only, same question types, same timer/lose-focus/scoring mechanics.

**Wireframe:** identical to Student's `/quizzes/[id]/attempt` — see `screens-student.md`. No aspirant-specific layout differences.

**Data / API:** Same endpoints as Student — `quiz_id` alone determines whether it's a Course-track or JAMB-track quiz server-side; the client doesn't need role-specific attempt logic.

**States:** same as Student version, including the same held-score verification requirement.

---

### `/history`
- **Task:** P4-4 (shared build)
- **Purpose:** Same as Student's, JAMB-subject framing instead of Course.

**Wireframe**
```
FRAME: History
  FIELD: Filter -> [ JAMB Subject select ] [ Type: Topic / Course ]
  LIST ROW: Physics — Week 4 | Course Quiz | attempted Aug 20 | Score pending pill
  LIST ROW: Physics — Topic: Optics | Topic Quiz | attempted Aug 18 | 91% (practice, doesn't count)
```

**Data / API:** `GET /api/me/attempts?type=&jambSubjectId=`. Same held/released omission rule as Student.

**States:** same as Student version.

---

### `/resources`
- **Task:** P6-3 (shared build)
- **Purpose:** Browse PDFs/articles scoped to JAMB subjects instead of Faculty/Department/Level/Course.

**Wireframe**
```
FRAME: Resources
  FIELD: Filter -> [ JAMB Subject select ]
  LIST ROW: "Mechanics Formula Sheet" (PDF) | Physics | [Download]
  LIST ROW: "Common Grammar Mistakes" (Article) | Use of English | [Read]
```

**Data / API:** `GET /api/resources?jambSubjectId=` — folder path per `DESIGN.md` §6: `/resources/jamb/{subject}/`.

**States:** same as Student version.
