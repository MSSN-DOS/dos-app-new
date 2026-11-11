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

A Student may sign in with **either** identifier — the signup value, their Matric Number, or their JAMB number (`DESIGN.md` §2, amended 2026-11-10). The input is plain text; the server matches all three columns, so the field doesn't need to guess the format. Case doesn't matter: the field upper-cases as they type and the server compares case-insensitively, so `21/30gn019` signs in the same as `21/30GN019` (2026-11-11).

**Data / API**
- `POST /api/auth/login` — `{ identifier, password }` → `{ token, role }`. On success, store token (per `DESIGN.md` §7), redirect by role: admin → `/admin`, teacher → `/teacher`, student/aspirant → `/dashboard` (or `/onboarding` first if their profile row doesn't exist yet).

**States:** default · submitting (disable button, show spinner in-button) · error (bad credentials — one generic message, never "wrong password" vs "no such user" separately, to avoid identifier enumeration).

**Notes:** No "forgot password" flow for MVP — not in `PLAN.md`, don't build it unprompted.

---

### `/register/student`
- **Task:** P1-8
- **Guard:** public
- **Purpose:** Student self-registration with a Matric Number **or** a JAMB Registration Number (`DESIGN.md` §2, amended 2026-11-10) — whichever the student has right now. The other can be attached later from `/account/identifiers`.

**Layout**
- Same centered single-column card pattern as `/login`.

**Wireframe**
```
FRAME: Register — Student
  FIELD: Full name -> [ text input ]
  FIELD: Matric Number or JAMB Reg No. -> [ text input, format hint: YY/FF/DD### or 12 digits + 2 letters, upper-cased as you type ]
  FIELD: Password -> [ password input ]
  FIELD: Confirm password -> [ password input ]
  ACTION ROW: [Create account: primary]
  NOTE: Already registered? Log in
```

**Data / API**
- `POST /api/auth/register` — `{ role: 'student', fullName, identifier, password }`. Validates the identifier against `matricNumberSchema` **or** `jambRegNumberSchema` (`DESIGN.md` §2) client-side (inline, as-you-type) and server-side (authoritative). On success: auto-login, redirect straight to `/onboarding` — no separate "check your email" step, there's no email.

**States:** default · inline field errors (matches neither format → shown under the field, not just on submit) · duplicate-identifier error (already registered) · submitting · success (redirect, no interim screen).

---

### `/register/aspirant`
- **Task:** P1-8
- **Guard:** public
- **Purpose:** Aspirant self-registration with JAMB Registration Number.

**Layout / Wireframe:** identical structure to `/register/student`, swap the identifier field:

```
FRAME: Register — Aspirant
  FIELD: Full name -> [ text input ]
  FIELD: JAMB Registration Number -> [ text input, format hint: 12 digits + 2 letters, e.g. 202612345678AB, upper-cased as you type ]
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

---

### `/account/password`
- **Task:** not in `PLAN.md` — added during P2-7's rework (Teachers get a generated one-time password, so they need a way to rotate it)
- **Guard:** authenticated, **any** role (`admin` / `teacher` / `student` / `aspirant`). The route behind it is deliberately role-agnostic — it only ever touches the caller's own row.
- **Purpose:** Change your own password by proving ownership with the current one. There is no self-service reset in the MVP (no email/SMS), so this is the only recovery path a user has.

**Layout**
- Centred single-column card (`AuthCard`, title "Change password") — not a full-width dashboard page. Reached from the header user menu entry **Change password** (present for every role).

**Wireframe**
```
FRAME: Change password
  FIELD: Current password       -> [ password ]
  FIELD: New password           -> [ password ]
  FIELD: Confirm new password   -> [ password ]
  INLINE ERROR (role=alert)     -> shown under the fields, not as a toast
  ACTION ROW: [ Change password: primary, full-width, h-11 ]
```

**Data / API**
- `POST /api/auth/change-password` — `{ currentPassword, newPassword }`. Role-agnostic `requireAuth()` (no role list). Proves ownership by verifying `currentPassword` against the stored hash; no reset token, no email.
- The confirmation field is **client-only** — it is never sent. The payload is exactly `currentPassword` + `newPassword`.
- All three inputs are `maxLength={72}` and `autoComplete`-tagged (`current-password` / `new-password`) so a password manager fills them correctly.

**Client-side validation** (mirrors `changePasswordSchema`, `lib/validation/auth.ts` — the same rule set at both ends, never a second copy elsewhere):
- new password length 8–72 (also enforced server-side)
- new password must differ from the current one (also enforced server-side)
- confirmation must match the new password (client-only, since it's not sent)

**States:** idle · submitting (button `aria-busy`, label → "Saving…", and `disabled` — the inputs themselves stay editable, only the submit is gated) · field error (inline `role="alert"`; a 422 `details[0].message` is surfaced verbatim, anything else falls back to the `ApiError` message or a generic retry line) · success (toast "Password changed", **all three fields cleared** — important on a shared/lab device).

**Notes:** Changing a password does **not** revoke existing sessions — tokens are stateless 7-day JWTs (`DESIGN.md` §7), so another device signed in with the old password keeps working until its token expires. That is a known, documented limitation, not a bug to "fix" here without a Board decision on token revocation.

---

### `/account/identifiers`
- **Task:** not in `PLAN.md` — Board decision 2026-11-10 (dual Student identifiers, `DESIGN.md` §2 decision 3)
- **Guard:** authenticated, `role = student` only. Rendered inside the normal authenticated shell; reachable from the student user menu as **Login details**, sibling to **Change password**.
- **Purpose:** Show both of a Student's sign-in identifiers and let them attach whichever one is missing — a Matric-signed-up student adds their JAMB number, a JAMB-signed-up student adds their Matric number. Adding is **one-way**: no edit, no removal.

**Layout**
- Same centred single-column card pattern as `/account/password` (`AuthCard`), not a full-width dashboard page.

**Wireframe**
```
FRAME: Login details
  ROW: Matric Number      -> 21/30GN019        (or "Not added")
  ROW: JAMB Reg. Number   -> 202612345678AB    (or "Not added")
  FIELD: <only the missing one> -> [ text input, format hint: YY/FF/DD###, upper-cased as you type ]
  ACTION ROW: [Add Matric Number / Add JAMB Number: primary]
  NOTE: You can sign in with either one. This can't be changed once added.
```

**Data / API**
- `GET /api/me` — reads `matricNumber` / `jambRegNumber` off the caller's row.
- `PATCH /api/me` — `{ identifier }`; the value's own format decides which column fills. Server rejects a value already on the account and a type already set, both 409. Client-side validation mirrors the server schema, is-as-you-type, and upper-cases the value as it's typed (letters are required uppercase, but typing lowercase must never be the reason an add fails).
- If both are already present, the page shows the two values and no form at all.

**States:** loading (query pending) · error (query failed — retry, not a blank card) · one identifier missing (form for that one) · both present (read-only summary) · submitting · field error (bad format, inline) · conflict (409 → human-readable message, form stays open).
