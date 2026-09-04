# Screen Specs — Auth (Public)

No role guard on any screen in this file — all four are pre-login or immediately-post-registration.

---

### `/login`
- **Task:** P1-8
- **Guard:** public
- **Purpose:** Single login form for all four roles — role is looked up server-side from the identifier, not chosen by the user.

**Layout**
- Centered single-column card, max-width ~400px, vertically centered on the viewport.
- No nav/sidebar — this is outside the authenticated shell entirely.

**Wireframe**
```
FRAME: Login
  FIELD: Matric No. / JAMB Reg No. / Staff ID -> [ text input ]
  FIELD: Password -> [ password input ]
  ACTION ROW: [Log in: primary]
  NOTE: New student? Register  ·  New aspirant? Register  (links to /register/student, /register/aspirant)
```

**Data / API**
- `POST /api/auth/login` — `{ identifier, password }` → `{ token, role }`. On success, store token (per `DESIGN.md` §7), redirect by role: admin → `/admin`, teacher → `/teacher`, student/aspirant → `/dashboard` (or `/onboarding` first if their profile row doesn't exist yet).

**States:** default · submitting (disable button, show spinner in-button) · error (bad credentials — one generic message, never "wrong password" vs "no such user" separately, to avoid identifier enumeration).

**Notes:** No "forgot password" flow for MVP — not in `PLAN.md`, don't build it unprompted.

---

### `/register/student`
- **Task:** P1-8
- **Guard:** public
- **Purpose:** Student self-registration with Matric Number.

**Layout**
- Same centered single-column card pattern as `/login`.

**Wireframe**
```
FRAME: Register — Student
  FIELD: Full name -> [ text input ]
  FIELD: Matric Number -> [ text input, format hint: YY/FF/DD### ]
  FIELD: Password -> [ password input ]
  FIELD: Confirm password -> [ password input ]
  ACTION ROW: [Create account: primary]
  NOTE: Already registered? Log in
```

**Data / API**
- `POST /api/auth/register` — `{ role: 'student', fullName, identifier, password }`. Validates identifier against `matricNumberSchema` (`DESIGN.md` §2) client-side (inline, as-you-type) and server-side (authoritative). On success: auto-login, redirect straight to `/onboarding` — no separate "check your email" step, there's no email.

**States:** default · inline field errors (bad format, shown under the field, not just on submit) · duplicate-identifier error (already registered) · submitting · success (redirect, no interim screen).

---

### `/register/aspirant`
- **Task:** P1-8
- **Guard:** public
- **Purpose:** Aspirant self-registration with JAMB Registration Number.

**Layout / Wireframe:** identical structure to `/register/student`, swap the identifier field:

```
FRAME: Register — Aspirant
  FIELD: Full name -> [ text input ]
  FIELD: JAMB Registration Number -> [ text input, format hint: 10 or 14 characters ]
  FIELD: Password -> [ password input ]
  FIELD: Confirm password -> [ password input ]
  ACTION ROW: [Create account: primary]
  NOTE: Already registered? Log in
```

**Data / API:** `POST /api/auth/register` — `{ role: 'aspirant', ... }`, validated against `jambRegNumberSchema`. Same states as `/register/student`.

**Notes:** Consider a shared `<RegisterForm role="student"|"aspirant">` component rather than duplicating the two pages — they differ only in the identifier field's label/validator and the `role` sent to the API.

---

### `/onboarding`
- **Task:** P1-9 (initial build), P2-8 (verified end-to-end once real structure data exists)
- **Guard:** requires a valid JWT (any freshly-registered user), but blocks access once a profile already exists — redirect straight to the role's dashboard instead of re-showing this.
- **Purpose:** One-time, role-branching structure selection. This is what makes the rest of the app scoped correctly — nothing else works right without it.

**Layout**
- Same centered card pattern, but branches entirely on role — two different bodies, same shell.

**Wireframe — Student branch**
```
FRAME: Onboarding — Student
  FIELD: Faculty -> [ select ]
  FIELD: Department -> [ select, options filtered by Faculty above, disabled until Faculty chosen ]
  FIELD: Level -> [ select, options filtered by Department above, disabled until Department chosen ]
  ACTION ROW: [Continue to dashboard: primary]
  NOTE: No GPA/CGPA entry — the platform calculates it from quiz results.
```

**Wireframe — Aspirant branch**
```
FRAME: Onboarding — Aspirant
  FIELD: Department of Aspiration -> [ select, all departments, not filtered ]
  ACTION ROW: [Continue to dashboard: primary]
  NOTE: No JAMB score entry — the platform calculates Post-UTME from quiz results.
```

**Data / API**
- `GET /api/admin/structure/faculties`, then `.../departments?facultyId=`, then `.../levels?departmentId=` (from `department_levels`) — cascading selects, each dependent select's options only fetched once its parent is chosen.
- `POST /api/auth/onboarding` — `{ facultyId, departmentId, levelId }` (Student) or `{ aspirationDepartmentId }` (Aspirant). On success, redirect to `/dashboard`.

**States:** loading (cascading selects show a disabled/loading state while their parent's choice resolves), empty (no Faculties exist yet — Admin hasn't set up structure; show a clear "not ready yet, check back soon" message rather than an empty dropdown that looks broken), submitting, error.

**Notes:** This screen is functionally untestable until Phase 2's Admin structure CRUD exists — build the form in Phase 1 (P1-9), but don't consider it actually verified until P2-8.
