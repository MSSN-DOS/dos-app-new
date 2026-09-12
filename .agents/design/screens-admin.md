# Screen Specs — Admin

All screens in this file: **Guard:** `role = admin`. All live under an `(admin)` layout with a persistent left-nav (Dashboard, Structure, Teachers, Students, Aspirants, Content, Leaderboard, Score Release, Settings) — build that shell once (P2-1) and every screen below renders inside it.

---

### `/admin` — Dashboard
- **Task:** P8-2
- **Purpose:** Landing screen after login. At-a-glance counts + the two things Admin needs to act on regularly.

**Wireframe**
```
FRAME: Admin — Dashboard
  STAT ROW: [ Students: N ] [ Aspirants: N ] [ Teachers: N ]
  LIST ROW: Pending score releases | count | pill (links to /admin/scores/release)
  ACTION ROW: [Upload PDF/Article] [Manage Teachers]
```

**Data / API:** `GET /api/admin/dashboard` — aggregate counts + held-attempt count. One combined endpoint, not four separate round trips.

**States:** loading (skeleton stat cards) · error (retry).

---

### `/admin/structure/levels`
- **Task:** P2-3
- **Purpose:** CRUD for the flat list of Levels (100–600).

**Wireframe**
```
FRAME: Structure — Levels
  ACTION ROW: [+ Add level]
  LIST ROW: 100 | [Edit] [Delete]
  LIST ROW: 200 | [Edit] [Delete]
  ...
```

**Data / API:** `GET/POST/PATCH/DELETE /api/admin/structure/levels`. Delete should warn/block if any `department_levels` row references it.

**States:** loading · empty ("No levels yet — add your first one") · error · delete-confirm (modal, since this can cascade).

---

### `/admin/structure/faculties`
- **Task:** P2-4
- **Purpose:** CRUD for Faculties — the top of the academic hierarchy.

**Wireframe**
```
FRAME: Structure — Faculties
  ACTION ROW: [+ Add faculty]
  LIST ROW: Faculty of Science | 4 departments | [Edit] [Delete]
  LIST ROW: Faculty of Engineering | 6 departments | [Edit] [Delete]
```

**Data / API:** `GET/POST/PATCH/DELETE /api/admin/structure/faculties`. List response includes a department count so the list is informative without a drill-in.

**States:** same pattern as Levels. Delete should block (not cascade silently) if departments exist under it.

---

### `/admin/structure/departments`
- **Task:** P2-5
- **Purpose:** CRUD for Departments, each scoped to one Faculty, with a multi-select for which Levels apply to it.

**Wireframe**
```
FRAME: Structure — Departments
  FIELD: Filter by Faculty -> [ select, optional ]
  ACTION ROW: [+ Add department]
  LIST ROW: Materials & Metallurgical Engineering | Faculty of Engineering | Levels: 100-500 | [Edit] [Delete]

FRAME: Add/Edit Department (modal or inline panel)
  FIELD: Name -> [ text input ]
  FIELD: Faculty -> [ select ]
  FIELD: Active Levels -> [ multi-select checkboxes, e.g. 100 ☑ 200 ☑ 300 ☑ 400 ☑ 500 ☐ 600 ☐ ]
  ACTION ROW: [Save: primary] [Cancel]
```

**Data / API:** `GET/POST/PATCH/DELETE /api/admin/structure/departments`, writes to `department_levels` as a set-replace on save (not incremental add/remove calls).

**States:** loading · empty · error · save-validation (must pick a Faculty and at least one Level).

---

### `/admin/structure/courses`
- **Task:** P2-6
- **Purpose:** CRUD for Courses — the most complex structure screen, due to the 4 scope types.

**Wireframe**
```
FRAME: Structure — Courses
  FIELD: Filter by Department / Level / Semester -> [ selects, optional ]
  ACTION ROW: [+ Add course]
  LIST ROW: MAT 101 | Mathematics | 100L | Harmattan | Department scope | [Edit] [Delete]
  LIST ROW: GNS 101 | — | 100L | Harmattan | General scope | [Edit] [Delete]

FRAME: Add/Edit Course (modal or inline panel)
  FIELD: Code -> [ text input, e.g. "MAT 101" ]
  FIELD: Title -> [ text input ]
  FIELD: Level -> [ select ]
  FIELD: Semester -> [ Harmattan / Rain toggle ]
  FIELD: Scope type -> [ select: Department / Faculty / General / Interfaculty ]
  FIELD (if Department scope): Department -> [ select ]
  FIELD (if Faculty scope): Faculty -> [ select ]
  FIELD (if Interfaculty scope): Faculties -> [ multi-select, 2+ required ]
  ACTION ROW: [Save: primary] [Cancel]
```

**Data / API:** `GET/POST/PATCH/DELETE /api/admin/structure/courses`. The scope-dependent field block should show/hide reactively as `scope_type` changes — mirror the DB CHECK constraint in `DESIGN.md`/schema client-side so a bad combination can't even be submitted.

**States:** loading · empty · error · scope-validation (the right field(s) must be filled for the chosen scope, everything else must be empty — this is the one screen where getting the conditional logic wrong silently breaks course visibility platform-wide, test it carefully).

---

### `/admin/teachers`
- **Task:** P2-7
- **Purpose:** Create and list Teacher accounts. Teachers don't self-register (`DESIGN.md` §7).

**Wireframe**
```
FRAME: Teachers
  ACTION ROW: [+ Add teacher]
  LIST ROW: Ibrahim, S. — staff_id: STF-014 | 12 quizzes published | [Deactivate]

FRAME: Add Teacher (modal)
  FIELD: Full name -> [ text input ]
  FIELD: Staff ID -> [ text input ]
  FIELD: Initial password -> [ text input, Admin sets this ]
  ACTION ROW: [Create account: primary] [Cancel]
```

**Data / API:** `GET/POST /api/admin/teachers`, `PATCH /api/admin/teachers/[id]` for deactivate (`users.is_active = false`, don't hard-delete — quiz/question authorship references would break).

**States:** loading · empty ("No teachers yet") · error · duplicate-staff-id error.

---

### `/admin/students`
- **Task:** P8-1
- **Purpose:** Searchable directory of all Students, with drill-down into an individual's performance history.

**Wireframe**
```
FRAME: Students
  FIELD: Search -> [ text input: name or matric no. ]
  FIELD: Filter -> [ Faculty / Department / Level selects, optional ]
  LIST ROW: Bello, A. — MAT/2023/0142 | Chemical Eng · 300L | CGPA 4.21 | [View]

FRAME: Student Detail (drill-down, /admin/students/[id])
  STAT ROW: [ Current CGPA ] [ Quizzes taken ]
  LIST ROW: per-week CGPA history
  LIST ROW: per-quiz attempt history (course + score + released status)
```

**Data / API:** `GET /api/admin/users/students?search=&facultyId=&departmentId=&levelId=`, `GET /api/admin/users/students/[id]`.

**States:** loading · empty (no matches) · error · pagination (this list can get large — paginate or virtualize, don't load all students at once).

---

### `/admin/aspirants`
- **Task:** P8-1
- **Purpose:** Same pattern as `/admin/students`, scoped to Aspirants and Post-UTME instead of CGPA.

**Wireframe**
```
FRAME: Aspirants
  FIELD: Search -> [ text input: name or JAMB reg no. ]
  LIST ROW: Yusuf, F. — 12345678AB | Aspiring: Medicine & Surgery | Post-UTME 38/50 | [View]
```

**Data / API:** `GET /api/admin/users/aspirants?search=`, `GET /api/admin/users/aspirants/[id]`. Same detail-drill-down shape as Students, swap CGPA for Post-UTME history.

**States:** same as `/admin/students`.

---

### `/admin/content`
- **Task:** P6-2
- **Purpose:** Upload PDFs / write articles. Admin-only (`DESIGN.md` §6).

**Wireframe**
```
FRAME: Content — Upload
  FIELD: Type -> [ PDF / Article toggle ]
  FIELD: Title -> [ text input ]
  FIELD (if PDF): File -> [ file picker, PDF only ]
  FIELD (if Article): Body -> [ rich text area ]
  FIELD: Scope -> [ Student: Course select  |  Aspirant: JAMB Subject select ]
  ACTION ROW: [Publish: primary]

FRAME: Content — Existing
  LIST ROW: "Week 4 Reading" | PDF | CHE 301 | [Delete]
  LIST ROW: "Understanding Reaction Kinetics" | Article | CHE 301 | [Delete]
```

**Data / API:** `POST /api/admin/content` (multipart for PDF), writes to Supabase Storage at the path from `DESIGN.md` §6, then `content_items`. `GET/DELETE /api/admin/content`.

**States:** loading · uploading (progress, PDFs can be large) · empty · error (file too large / wrong type) · scope-required-error (must pick exactly one of Course or JAMB Subject, not both, not neither).

---

### `/admin/leaderboard`
- **Task:** P5-6
- **Purpose:** Two separate rankings — Student and Aspirant never merge (`DESIGN.md` §5).

**Wireframe**
```
FRAME: Leaderboard — Students
  FIELD: Week -> [ select, defaults to most recent released week ]
  LIST ROW: #1 | Bello, A. | CGPA 4.62
  LIST ROW: #2 | Suleiman, K. | CGPA 4.55
  NOTE: Admin-only. Not visible to students.

FRAME: Leaderboard — Aspirants
  LIST ROW: #1 | Yusuf, F. | 47/50
  LIST ROW: #2 | Okoro, C. | 45/50
```

**Data / API:** `GET /api/admin/leaderboard?track=student|aspirant&week=`. Only ever queries released weeks (per the schema comment on `cgpa_records`/`post_utme_scores`).

**States:** loading · empty (no released week yet) · error.

---

### `/admin/scores/release`
- **Task:** P5-1
- **Purpose:** The one screen that actually makes scores visible to Students/Aspirants. Held by default (`DESIGN.md` §4).

**Wireframe**
```
FRAME: Score Release
  FIELD: Week -> [ select ]
  LIST ROW: CHE 301 — Course Quiz | 214 attempts held | [Release this quiz]
  LIST ROW: CHE 305 — Course Quiz | 198 attempts held | [Release this quiz]
  LIST ROW: Physics (JAMB) — Course Quiz | 340 attempts held | [Release this quiz]
  ACTION ROW: [Release all for this week: primary]
  NOTE: Releasing recomputes CGPA/Post-UTME for every affected user in the same action.
```

**Data / API:** `GET /api/admin/scores/held?week=`, `POST /api/admin/scores/release` (`{ quizId }` or `{ weekStart }` for bulk). Server-side: sets `released_at = now()`, triggers CGPA/Post-UTME recompute synchronously (`DESIGN.md` §5) — the response should confirm both happened, not just the release.

**States:** loading · empty (nothing held — everything already released or no attempts yet) · releasing (disable the button, show progress — this can touch hundreds of rows) · error · success (list updates in place, released items drop off or move to a "recently released" sub-list).

---

### `/admin/settings/semester`
- **Task:** P7-3
- **Purpose:** Auto/manual toggle for the active semester, and the override picker (`DESIGN.md` §8).

**Wireframe**
```
FRAME: Semester Settings
  FIELD: Mode -> [ Auto (calendar-driven) / Manual override — toggle ]
  NOTE (auto mode): Active semester: Rain — derived from today's date against the 2025/26 calendar.
  FIELD (manual mode only): Override -> [ Harmattan / Rain select ]
  ACTION ROW: [Save: primary]
  NOTE: Manual mode is a safety net for when real dates drift from the hardcoded calendar — auto is the default.
```

**Data / API:** `GET/PATCH /api/admin/settings/semester` — reads/writes the single-row `semester_settings` table.

**States:** loading · saving · error. This screen is low-traffic (Admin visits rarely) — no need for elaborate empty states, just a sane default (`mode: 'auto'`) on first load.
