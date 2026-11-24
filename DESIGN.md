# DESIGN.md — DOS Site

This is the single source of truth for how the product behaves and how the code should be shaped. Where this document and the original requirements/proposal docs disagree, **this document wins** — it reflects the alignment interview of 2026-08-22 that closed every open question.

---

## 1. Roles

### Academic structure workspace (2026-11-24 amendment)

Admins manage faculties, departments, shared levels, courses and topics through
`/admin/structure`. The approved Structure Studio layout uses the existing DOS
shell and tokens: a browser beside record details on desktop, one pane at a time
with Browse/Search/Setup/New controls on mobile. Teacher Topics remains separate.
Legacy admin structure and topic URLs redirect to this workspace; course detail
links preserve the course selection. Record, academic session and related-list
pagination state are shareable in the URL.

Levels remain global records linked to departments. Department courses are shown
even if their level is absent from that department's configured levels. Faculty-wide
courses appear beneath their faculty; general/interfaculty courses have a Shared
courses branch. Search queries descendants directly across sessions, rather than
requiring a matching parent. Selecting a search result opens its own session.

Course-copy operations require a different, existing session, reject an existing
code/session/level/semester combination, preserve scope and faculty links, and
optionally copy topic titles. They never copy quizzes, questions, attempts, grades,
assignments or resources. Topic batches accept at most 100 titles, trim whitespace,
retain numbering and skip case-insensitive duplicates with explicit added/skipped
counts. Course/topic writes share a transaction-scoped lock before duplicate reads;
failed batch writes roll back together. No migration is required.

Deletion keeps the existing server-side reference guards and asks for confirmation;
there is no snapshot-based Undo. Dirty sheets ask before discarding and warn before
browser unload. Empty setup reminders are informational. Course details paginate
topics and course-only quizzes independently; topic details show only that topic's
quizzes, using the existing preview action. Related lists and tree branches use
bounded database queries.

`admin`, `teacher`, `student`, `aspirant` — one `roles` table, one `users` table, role-specific detail in `student_profiles` / `aspirant_profiles`. See §5 for the schema.

## 2. Resolved decisions (source of truth — supersedes Section 9 of the requirements doc)

| # | Question | Resolution |
|---|---|---|
| 1 | Admin vs Teacher publishing boundary | Teachers publish quizzes and topics directly. No Admin approval step. |
| 2 | Fill-in-the-gap grading | Case-insensitive exact match, auto-graded at submission. |
| 3 | Identifier validation | Format-validated only (regex below), no cross-check against an external membership/JAMB list. **Amended 2026-11-10:** a Student may sign up with *either* a Matric Number or a JAMB Registration Number, and may attach the other one later from `/account/identifiers`; login accepts any of `users.identifier`, `users.matric_number`, `users.jamb_reg_number`. Aspirants remain JAMB-only. See §2 "Identifier formats" and §7 step 1. |
| 4 | Content upload permissions | Admin-only. Teachers cannot upload PDFs/articles. **Amended 2026-09-17:** Teachers *may* submit video **links** (an external URL — not an upload; see §6). |
| 5 | Topic Quiz question count | Free-form — Teacher sets it per topic when building the quiz. |
| 6 | Weekly Course Quiz release window | Default: opens Saturday 00:00, closes Monday 00:00 (Africa/Lagos, see §8). **Amended 2026-09-28:** an Admin may override either boundary per quiz (`quizzes.opens_at` / `quizzes.closes_at`, both nullable); NULL on both restores the default. Set on either side replaces that boundary only. |
| 7 | Notifications | In-app only for MVP. No email/SMS. |
| 8 | Department/Faculty list source | Board enters manually via Admin UI. No external import. |
| 9 | Course catalogue ownership | Board/Admin owns it, entered manually via Admin UI. |
| 10 | Score release mechanism | Held by default on submission. Admin manually releases, per-quiz or in bulk, from an Admin panel. |
| 11 | Active semester | Auto-switches on fixed calendar dates (§8), with a manual Admin override as a safety net. |
| 12 | Auth mechanism | Custom JWT, `Authorization: Bearer <token>` header, `localStorage` client-side, 7-day expiry, no refresh token. |

### Identifier formats (locked in)

**Matric Number:** `YY/FF/DD###`
- `YY` — 2-digit year of entry
- `FF` — 2-digit faculty code
- `DD` — 2 uppercase letters, department code
- `###` — 3-digit serial number

Regex: `^\d{2}\/\d{2}[A-Z]{2}\d{3}$` — e.g. `21/30GN019`

**JAMB Registration Number:** one accepted shape — 4-digit year + 8 digits + 2 uppercase letters, i.e. 12 digits + 2 letters (14 characters total).

Regex: `^\d{12}[A-Z]{2}$` — e.g. `202612345678AB`

> **Amended 2026-11-10:** the older 10-character shape (8 digits + 2 letters) is **no longer accepted anywhere** — not in registration, not in login, not for aspirants. The prior "two accepted shapes" rule was replaced, not widened; anything matching only the 10-character shape must fail validation.

Both live in `lib/validation/identifiers.ts` as named Zod refinements (`matricNumberSchema`, `jambRegNumberSchema`), reused by the registration form, the `/account/identifiers` form, and every handler that validates an identifier (`/api/auth/register`, `/api/me`) — never duplicate the regex. `identifierTypeFor(value)` there is the single place that decides which of the two an input is; the two formats are disjoint, so one call is unambiguous.

**Case is not part of the format.** The letters must be uppercase, but nobody should be rejected for typing `21/30gn019` or `202612345678ab` on a phone keyboard (2026-11-11). Every schema trims and upper-cases the value *before* the format check and returns that normalised value, so whatever reaches the DB is uppercase — registration and `PATCH /api/me` both write the parsed value straight to the column. Sign-in compares case-insensitively on both sides (`upper(column) = upper(input)`) rather than upper-casing the input only, because a seeded or hand-set identifier such as `BOOTSTRAP_ADMIN_IDENTIFIER` is env-provided and never went through these schemas. The register, sign-in and `/account/identifiers` fields also convert as the user types, so they see the shape that will be stored.

**Which identifier identifies a Student.** Students hold up to two identifiers, both on the `users` row: `identifier` (the one used at signup, which also drives `identifier_type`) plus `matric_number` and `jamb_reg_number`, each nullable and unique, filled while the value is known. Signup fills whichever column the entered format maps to; `PATCH /api/me` fills the other one later. Adding is one-way — once a value is set, the student cannot edit or remove it. Login matches `identifier OR matric_number OR jamb_reg_number`, preferring the `identifier` hit on a tie so a value shared with a bootstrap admin account resolves to the real owner.

### Known trade-off: JWT in localStorage

Storing the JWT in `localStorage` with no refresh token is vulnerable to token theft via XSS (any injected script can read `localStorage` and exfiltrate the token, which is then valid for up to 7 days). This was a deliberate choice for MVP simplicity over an in-memory + refresh-cookie pattern. Mitigate by:
- Strict Content-Security-Policy headers (no inline scripts, no unvetted third-party scripts)
- Escaping all user-generated content rendered anywhere (question text, articles) — never `dangerouslySetInnerHTML` without sanitization
- Treat any future addition of third-party scripts (analytics, widgets) as a security review item, not a drop-in

If this app ever handles anything more sensitive than quiz scores, revisit this — it is not the right pattern for a banking app. It is an acceptable one here.

---

## 3. Academic structure

```
Faculty
 └─ Department (belongs to one Faculty; has a set of active Levels via department_levels)
     └─ Level (the platform runs 100 and 200 — Board answer 2026-11-13; the table can hold
        others and an Admin can attach one to a Department, but onboarding only offers 100/200)
         └─ Course (belongs to a Level + Semester, has a scope_type)
             └─ Topic (created by Admin or Teacher)
```

Course `scope_type` controls visibility to Students:

| scope_type | Visible to |
|---|---|
| `department` | Students in that one Department |
| `faculty` | Students in every Department under that Faculty |
| `general` | All Students, university-wide |
| `interfaculty` | Students in the specific Faculties Admin manually attaches via `course_faculties` |

Aspirants sit outside this tree entirely — they're organized by `jamb_subjects`, flat, no Faculty/Department/Level/Semester scoping. An Aspirant's `aspiration_department_id` (set at onboarding) is informational only and never used to filter content.

## 4. Quizzes

Two types, same `quizzes` table, discriminated by `quiz_type`:

| | Topic Quiz | Course Quiz |
|---|---|---|
| Tied to | One `topic_id` | A `course_id` (or `jamb_subject_id` for Aspirants) + `week_start` |
| Question count | Free-form, Teacher decides | Fixed 50 |
| Cadence | Ad hoc, whenever a Teacher publishes one | Weekly, opens Saturday 00:00 / closes Monday 00:00 WAT (Admin-overridable per quiz, decision 6) |
| Counts toward CGPA / Post-UTME / leaderboard | No | Yes — only source that counts |

Rules that apply to both:
- Every attempt is recorded in `quiz_attempts`; only the highest `score` per `(user_id, quiz_id)` is written to `best_scores` and counts toward the official record.
- Multiple attempts are allowed only if `allow_multiple_attempts = true`. Question and answer shuffling are separately configurable, and resume restores the original attempt time and saved responses.
- A question can't be published with missing text or a required option — enforce this in the Zod schema for the "publish" action specifically (the "save as draft" action has no such requirement).
- Options questions are single-select only (`attempt_answers.selected_option_id` is a single FK) — the question bank's `is_correct` flag should therefore be true on exactly one `question_option` per question; enforce this at question-creation time, not just at grading time.

### Grading

- **Options:** correct iff `selected_option_id` matches the option where `is_correct = true`.
- **Fill in the gap:** correct iff the trimmed, lowercased submitted answer matches `question_blanks.accepted_answer` (also trimmed/lowercased), regardless of `question_blanks.case_sensitive` — that column is unused under the resolved case-insensitive-always rule; keep it in the schema for future flexibility but the grading code path ignores it for MVP.
- Multi-blank questions: every blank must be correct for the question to count as correct (no partial credit for MVP).
- **Amended 2026-11-14:** configured whole question marks determine the score: `max(0, earned_marks) / total_marks * 100`, stored as `NUMERIC(6,2)`. Apply total marks distributes whole marks as evenly as possible, with remainder marks assigned to the earliest questions. Gaps remain all-or-nothing. With deductions enabled an incorrect, answered objective question loses its full marks; unanswered questions earn zero.
- Objective grading happens synchronously on submit. Essays are manually graded by the teacher/Admin, with awards between zero and the question's marks, and are excluded from automatic deductions. Attempts containing essays have `score = NULL` until every essay is graded.

### Score release

- On submit, `quiz_attempts.submitted_at` is written immediately. Completed objective scores stay held; essays must finish manual grading before Admin release is available. The score and pass/fail are **not sent to the student/aspirant** until release, and can be hidden by the quiz's results setting. Answers and explanations follow their separate review setting.
- Add a `released_at TIMESTAMP NULL` column to `quiz_attempts` (not in the original schema — this is a deliberate addition, see `DESIGN.md` changelog at the bottom). `NULL` = held.
- Admin release actions: release one quiz's attempts, or bulk-release all attempts for a given `week_start`. Both just set `released_at = now()` on the matching rows.
- Until released, the Student/Aspirant UI shows "Score pending" (see wireframe) — the raw score is not sent to the client at all while held, not just hidden in the UI.

### Authoring rebuild (P12, 2026-11-14)

- Teacher/Admin builder supports True/False (an options preset), single-answer multiple choice, `[gap]` fill-in-gap, shared passages with sub-questions, and manually graded essays. Course Quizzes retain exactly 50 questions. Drafts allow incomplete questions; publishing validates every question, passage, schedule and marks allocation.
- Description, instructions, questions, options, passages and explanations share Tiptap rich text with KaTeX. Cover and inline quiz images use a private Supabase bucket through authenticated, owner-scoped endpoints; this is separate from Admin-only PDF/article resources.
- Quiz access remains signed-in and scoped to the existing academic track. Public/Private controls are omitted and the compatibility visibility column does not grant access.
- Teachers may enable a start time and optional end time in Africa/Lagos. An enabled schedule uses the same `opens_at`/`closes_at` columns as the Admin availability override and replaces the week-derived window; without scheduling, Course Quizzes retain their existing default/override window. Duration is optional and stored in seconds; null is untimed.
- Per-user setting defaults and pins are stored in `user_preferences`. New quizzes apply the current user's defaults, with fresh schedule dates and a default pass mark of 60.

### Question-bank authoring amendment (2026-11-15)

The bank exposes True/False, Multiple choice, Fill in the gap, Passage and Essay
to Teachers/Admins. True/False reuses two fixed single-select options; Passage
saves a shared text and its child questions together; Essay remains manually
graded when used in a quiz. Gap grading stays trimmed, case-insensitive exact
match, with all blanks required. Draft and publish schemas remain distinct.

Bank document writes enforce subject assignment, ownership, revision conflicts
and existing quiz/attempt references. New quizzes receive independent copies of
bank documents, passage children and images. Bank images use private Storage
paths `question-bank/{authorId}/{uuid}.{png|jpg|webp}` and authenticated signed
links; no guest authoring or direct Storage writes. PNG/JPEG/WebP uploads are
limited to 5 MB and checked against their file signatures. Referenced images
cannot be deleted. `questions.bank_revision` and RLS-protected `question_images`
are additive schema deltas shipped in generated migration 0012.

### Quizboot completion amendment (P12-11, 2026-11-16)

The supplied `QUIZBOOT_SPEC.md` updates the authoring layout: editable header title,
Questions/Settings/Results tabs, one expanded question card, a shared toolbar for
the focused rich field, a floating Add question dropdown, and More/Advanced panels.
Question authoring lives in the quiz builder for both roles. The standalone
Questions screens are retired, and their URLs redirect to each role's Quizzes
list. New quiz creation still requires DOS academic scope. Existing published
bank questions and images remain available as independent copies in draft quizzes.

- Multi-answer is a distinct type. Its selected option IDs must equal the correct
  set exactly; extra or missing selections earn no marks. Ordinary Multiple choice
  and True/False remain single-select.
- Numeric questions store a finite value, nonnegative absolute tolerance, and an
  optional unit label. Inclusive tolerance grading performs no unit conversion.
- Inline gap boxes serialize to `[gap]` plus separate accepted answers. Every gap
  uses trimmed, case-insensitive exact matching; pipe-separated alternatives are
  deliberately excluded by the confirmed Board answer.
- Questions may shuffle their own options independently of the global setting.
  Resume restores the deterministic order of the original attempt. Attempts may be
  single, limited (2–100), or unlimited; the server enforces the limit.
- Draft autosave uses authenticated builder writes and revision conflicts. It
  preserves edits typed during a request and reconciles persistence IDs by client
  key. Failed saves retain local edits and offer explicit retry.
- Unpublish hides new access while allowing started attempts to finish. The first
  attempt permanently locks questions and settings, even after attempts are deleted.
  Republish restores access to the same content. No editable quiz versions are added.
- Tiptap and KaTeX remain the shared editor/rendering stack, with mhchem reactions,
  editable science templates, plain-text paste, and resized private Storage images.
- Charts use actual released attempts only: score distribution, durations, and
  question outcomes. Admin release remains mandatory; no instant score release.
- Teachers/Admins can preview paginated A4 papers, optionally include a marking
  scheme on fresh pages, print, and download a multipage PDF. Oversized blocks scale
  together rather than splitting. Papers use paper-specific light tokens in both
  themes. PDF is a raster export; its text is not selectable.

Generated migrations 0013 and 0014 add the two types, numeric fields, per-question
shuffle, selected option sets, maximum attempts and persistent lifecycle metadata.
They are additive and retain the existing RLS policies.

## 5. Performance tracking

### CGPA (Students)

- Computed weekly, once Admin releases that week's Course Quiz scores.
- `cgpa_value` for a `(user, week_start)` = simple average of that student's `best_scores.best_score` across every **released** Course Quiz `best_score` whose quiz's `week_start` matches, scoped to quizzes visible to that student (their Department/Faculty/Level/active Semester, plus any General/Interfaculty course they're in scope for).
- No credit-unit weighting — every Course Quiz is the same 50-question format, so it's an unweighted mean.
- Recompute-on-release: when Admin releases a week's scores, trigger the CGPA recompute for every affected student in that same request/transaction — don't leave it to a cron job for MVP.

### Post-UTME (Aspirants)

- Same mechanism as CGPA but scoped to JAMB-subject Course Quizzes, and the resulting average is converted to Unilorin's 50-point scale.
- Conversion formula (raw is already 0–100 from quiz scoring): `converted_score_50 = round(raw_score / 2)`. This assumes the 50-point scale is a direct half-scale of the 0–100 quiz score — **flag this to the Board for confirmation before launch**; it was not part of the alignment interview and is a placeholder formula, not a resolved decision. Mark it clearly in code with a `// TODO(board-confirm):` comment and in `STATE.md`.

### Leaderboard

- Admin-only view. A query, not a stored table (matches the `-- CREATE VIEW leaderboard` comment at the bottom of `DOS-Site-Database-Schema.sql`).
- Ranks by `cgpa_value` (Students) or `converted_score_50` (Aspirants) for the most recent released `week_start`. Students and Aspirants are two separate leaderboards — never merge them into one ranked list, they're different tracks entirely.

## 6. Content / Resources

- `content_items` (`pdf` | `article` | `video`). `pdf`/`article` are Admin-only to create. `video` is a **link to externally-hosted video** (Google Drive, YouTube, Telegram) — an external URL, not a file, so nothing lands in Storage. Teachers may create `video` rows via `/api/teacher/resources` (Board decision 2026-09-17); that endpoint's schema hard-codes `type = 'video'`, so `pdf`/`article` stay out of reach for the role. Live on save — no approval queue, matching how Teachers already publish quizzes and topics.
- Files land in Supabase Storage under:
  - Students: `/resources/{faculty}/{department}/{level}/{semester}/{course}/`
  - Aspirants: `/resources/jamb/{subject}/`
- `content_items.body_or_file_url` is dual-use by `type` — a Storage object path (`pdf`), an inline markdown body (`article`), or the external URL exactly as pasted (`video`). Treat it as whichever the `type` says, and branch on `type` explicitly in the UI, never guess from the string shape. The `video` URL is stored **un-normalised** and parsed at read time by `lib/content/video-link.ts`, so improving that parser improves existing links too.
- **Video links are not semester-bound.** Every other student-scoped resource is filtered to the active semester (`/api/resources` joins `courses.semester`); `video` rows are exempt so a recorded lecture stays reachable after the semester rolls over (Board decision 2026-09-17). Drive links must be shared "Anyone with the link" or students see a request-access screen; Drive also rate-limits hotlinked video, so it is a stopgap, not a CDN.

## 7. Auth flow

1. **Register** (`POST /api/auth/register`): identifier (Matric or JAMB, format-validated per §2), full name, password. Creates a `users` row with `role_id` = `student` or `aspirant`, `identifier_type` set from the identifier's own format (a Student may use either; an Aspirant must use a JAMB number), and the matching one of `matric_number` / `jamb_reg_number` mirrored from the same value. Password hashed with `bcrypt` (or `argon2` — pick one in `AGENTS.md` and stick to it) before storage, never store plaintext even transiently beyond the request handler.
2. **Onboarding** (`POST /api/auth/onboarding`, requires a valid JWT from step 1's auto-login): Students select Faculty → Department → Level; Aspirants select Department of Aspiration. Writes `student_profiles` / `aspirant_profiles`. A user cannot access any role-scoped page until this row exists — enforce in middleware, not just by hiding the nav link.
3. **Login** (`POST /api/auth/login`): identifier + password, where the identifier may be the signup value, the Matric Number, or the JAMB number (§2) → JWT (7-day expiry) signed with `JWT_SECRET`, containing `{ userId, roleId }` only — no PII in the payload beyond the numeric IDs.
4. **Attach the second identifier** (`PATCH /api/me`, Students only): `{ identifier }` → fills whichever of `matric_number` / `jamb_reg_number` is still empty. One-way — no edit, no removal. Rejects a value already on the account, a type already set, and a value another account holds.
5. Client stores the JWT in `localStorage`, attaches `Authorization: Bearer <token>` to every `/api` call via a shared fetch wrapper (`lib/auth/client-fetch.ts`) — never hand-roll fetch calls with the header inline in a component.
6. Every `/api` route (except `register`/`login`) verifies the JWT server-side via a shared `requireAuth(request, allowedRoles: Role[])` helper in `lib/auth/guard.ts`, which throws a typed `UnauthorizedError`/`ForbiddenError` caught by a shared error handler. No route should hand-roll its own auth check.
- Admin accounts and Teacher accounts are **not self-registered**. Admin is bootstrap-seeded (`pnpm db:seed`); Teacher accounts are created by an Admin from `/admin/teachers` (`identifier_type = 'staff_id'`, Admin sets an initial password the Teacher changes on first login — first-login-forces-password-change is a nice-to-have, not required for MVP, track it in `STATE.md` as optional).

## 7a. Removing a Student account

An Admin can remove a Student at any time, in one of two ways:

- **Deactivate** (`PATCH /api/admin/users/students/[id]` `{ isActive: false }`) — reversible. Login already rejects inactive accounts; `requireAuth()` also re-reads the account on every request, so an existing token stops working immediately rather than at its 7-day expiry. Attempts, scores and CGPA are untouched, and reactivating restores the account exactly as it was.
- **Hard delete** (`DELETE /api/admin/users/students/[id]`) — permanent, and only reachable after the API validates the typed identifier against the target student. One transaction removes `quiz_attempts` (their `attempt_answers` cascade), `best_scores`, `cgpa_records`, `post_utme_scores`, `tour_completions`, then the `users` row (`student_profiles` and preferences cascade).

Deletion is not blocked by held/unreleased attempts: with the attempt gone, an unreleased score can never be released to anyone. It is also not blocked by CGPA or leaderboard history — rankings are computed live from `cgpa_records` in `GET /api/admin/leaderboard`, so past-week standings change retroactively when a Student is deleted. That drift is accepted; the confirm dialog says so instead of pretending otherwise. Students author no quizzes, questions, topics or content items, so no authored-content FK blocks the delete (the equivalent block exists for Teachers and is unrelated to this flow).

## 8. Active semester

- `semester_settings` table (new — add to schema, not in the original `.sql`): single row, `id = 1`, columns `active_semester TEXT CHECK (IN ('harmattan','rain'))`, `mode TEXT CHECK (IN ('auto','manual'))` default `'auto'`, `manual_override TEXT NULL`.
- **Auto mode** resolves the active semester from today's date against the fixed 2025/26-session calendar below. Store the calendar as a small static config (`lib/semester/calendar.ts`), not hardcoded inline in the resolver — next session's dates will need updating by whoever maintains this, and that file is the one place to do it.

| | Lectures | Examinations |
|---|---|---|
| Harmattan (1st) | Oct 20, 2025 – Jan 9, 2026 | Jan 19 – Feb 6, 2026 |
| Rain (2nd) | Feb 23 – Jun 5, 2026 | Jun 15 – Jul 3, 2026 |

- Treat "Harmattan" as active for the full Oct 20 → Feb 6 span (lectures + exams together), and "Rain" as active for Feb 23 → Jul 3. Gaps between semesters (e.g. Feb 7–22) fall back to whichever semester just ended, so students aren't shown an empty state — resolver logic, not a third semester state.
- **Manual mode**: if `semester_settings.mode = 'manual'`, the resolver returns `manual_override` regardless of date. Admin flips this from `/admin/settings/semester`. This is the safety net for when real dates drift from the hardcoded calendar.
- All quiz/course/resource queries scoped "to the active semester" call the single `getActiveSemester()` resolver — never re-derive it inline from `new Date()` in more than one place.

## 9. Route map

Course offerings require an explicit academic session. Admin course forms select
from the existing academic_sessions table and send sessionId on create/update.
Course details at /admin/structure/courses/[id] show academic metadata, paginated
topics and course quizzes. Topic View opens a dialog with its parent course and
paginated topic quizzes. Quiz View opens the existing student preview.

### Public
- `/login`
- `/register/student`, `/register/aspirant`
- `/onboarding` (post-registration, both tracks — branches on role)

### Admin (`/admin/*`, guarded, `role = admin`)
- `/admin` — dashboard (counts, pending release count, quick actions)
- `/admin/structure/levels`, `/admin/structure/faculties`, `/admin/structure/departments`, `/admin/structure/courses` — CRUD for academic structure
- `/admin/teachers` — create/manage Teacher accounts
- `/admin/students`, `/admin/aspirants` — directory, search/filter, view individual performance history
- `/admin/content` — upload PDFs/post articles
- `/admin/leaderboard` — Student and Aspirant leaderboards
- `/admin/scores/release` — pending held attempts, release per-quiz or bulk-by-week
- `/admin/settings/semester` — auto/manual toggle, override picker

### Teacher (`/teacher/*`, guarded, `role = teacher`)
- `/teacher` — dashboard
- `/teacher/topics` — create topics under a course
- `/teacher/quizzes` — list/create Topic + Course quizzes
- `/teacher/quizzes/[id]` — edit/build a quiz, attach questions
- `/teacher/results/[quizId]` — performance of students who took a specific quiz

### Student (`/student/*` or unprefixed under `(student)` group, guarded, `role = student`)
- `/dashboard` — CGPA, quiz list scoped to Faculty/Department/Level/active Semester
- `/quizzes/[id]/attempt` — take a quiz
- `/history` — past attempts and scores
- `/resources` — browse PDFs/articles scoped to their structure

### Aspirant (guarded, `role = aspirant`)
- `/dashboard` — Post-UTME score, JAMB-subject quiz list
- `/quizzes/[id]/attempt`
- `/history`
- `/resources` — JAMB-subject scoped

### Account (authenticated; role noted per page)
- `/account/password` — change your own password (any role)
- `/account/identifiers` — **Students only**: show both identifiers, attach whichever one is missing (decision 3, amended 2026-11-10)

### API surface (`/api/*`, mirrors the pages above 1:1)
- `/api/auth/register`, `/api/auth/login`, `/api/auth/onboarding`
- `/api/admin/structure/{levels,faculties,departments,courses}` — REST-style CRUD
- `/api/admin/teachers`
- `/api/admin/users/{students,aspirants}`
- `/api/admin/content`
- `/api/admin/leaderboard`
- `/api/admin/scores/release`
- `/api/admin/quizzes/[id]/window` — PATCH the Course Quiz availability override (decision 6)
- `/api/admin/quizzes/[id]` — DELETE an unattempted quiz (published quizzes require title confirmation), or PATCH `{ action: "archive" }` to stop new attempts while retaining existing attempts, released scores and grading history. Archiving uses the existing unpublish state and lets in-progress attempts finish. A quiz with attempt history is never permanently deleted through this endpoint.
- `/api/admin/settings/semester`
- `/api/teacher/topics`, `/api/teacher/questions`, `/api/teacher/quizzes`, `/api/teacher/quizzes/[id]`, `/api/teacher/results/[quizId]`
- `/api/quizzes` (list, scoped server-side to the caller's role/structure — Student/Aspirant), `/api/quizzes/[id]/attempt` (POST to submit)
- `/api/me` — current user + profile + CGPA/Post-UTME summary; `PATCH` attaches the second identifier (Students only, decision 3)
- `/api/resources`

Every route under `/api/admin/*` requires `role = admin`; `/api/teacher/*` requires `role = teacher`; everything else requiring auth checks role inline via `requireAuth`. No route is guarded only by folder convention — the `requireAuth` call inside the handler is the actual enforcement, folder naming is just for humans/agents navigating the repo.

**Public routes (complete list, amended 2026-11-13).** Only `POST /api/auth/register` and `POST /api/auth/login` are reachable without a token. Every other API handler calls `requireAuth()`, including onboarding and password changes. The Board withdrew the database keep-alive endpoint and its scheduler; do not recreate them.

## 10. Data model

Treat `DOS-Site-Database-Schema.sql` as the base schema — translate it into `lib/db/schema.ts` (Drizzle) table-for-table, column-for-column, with these deltas layered on top (all called out inline above too):

- Add `quiz_attempts.released_at TIMESTAMP NULL` (§4, score release).
- Add `semester_settings` table (§8, active semester).
- Add `users.matric_number` and `users.jamb_reg_number`, both `VARCHAR NULL UNIQUE` (§2, dual Student identifiers). `users.identifier` stays `NOT NULL UNIQUE` and remains the signup value — the two new columns are aliases for login, not a replacement.
- Everything else in the `.sql` file ships as-is.

## 11. Database permissions & Row-Level Security

**Resolved 2026-08-23, surfaced by Supabase's own RLS linter warnings during Phase 1 — not part of the original alignment interview, added here per `AGENTS.md` §6's pattern for undecided items caught mid-build.**

The app never uses Supabase Auth, so nothing ever configures RLS policies by default — but Supabase still provisions `anon`/`authenticated` roles with default grants on the `public` schema at project creation (so PostgREST works out of the box once policies exist). Left alone, that's a live side-door: anyone holding the anon key (public by design — it ships in any client-side Supabase SDK call) can hit PostgREST/GraphQL directly and read/write past `requireAuth()` entirely, regardless of how solid the Next.js API layer is.

**Policy, both layers required, in this order:**
1. **Revoke all grants from `anon` and `authenticated` on the `public` schema** — this is what actually closes the hole. The app's own DB access goes exclusively through `DATABASE_URL`/`DIRECT_URL` (typically the `postgres` role, which bypasses RLS — confirm this for your project with `SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user;`, don't assume it), never through the anon/authenticated PostgREST path.
2. **Enable RLS on every table, with a deny-all policy for `anon`/`authenticated`** — defense-in-depth on top of #1: protects against a future migration or dashboard change accidentally re-adding a grant, and is what actually satisfies the Supabase advisor/linter.

This is a platform-wide default, not a per-table judgment call: **every new table, from any future phase, ships with RLS enabled and a deny-all policy as part of the same migration that creates it** — see `AGENTS.md` §2. There's no case in this app's architecture where a table should be reachable via PostgREST/GraphQL directly; the Next.js API is the only sanctioned path, always.

Storage bucket policies are a related but separate check — `content_items` file URLs (§6 above) should be reviewed against the same "not reachable except through app-scoped access" principle once Phase 6 lands, not assumed safe just because the DB side is locked down.

## 12. Design tokens

Primary: blue. Accent: orange. Full scale, both themes — don't hand-pick single hex values ad hoc in components; every color used in the UI must resolve to a token below.

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222 20% 12%;

  --primary: 217 91% 45%;        /* blue */
  --primary-foreground: 0 0% 100%;

  --accent: 27 96% 55%;          /* orange */
  --accent-foreground: 222 20% 12%;

  --muted: 220 14% 96%;
  --muted-foreground: 220 9% 46%;

  --border: 220 13% 88%;
  --card: 0 0% 100%;

  --success: 142 71% 35%;
  --warning: 38 92% 50%;
  --destructive: 0 72% 51%;
}

.dark {
  --background: 222 25% 9%;
  --foreground: 210 20% 96%;

  --primary: 217 91% 60%;
  --primary-foreground: 222 25% 9%;

  --accent: 27 96% 62%;
  --accent-foreground: 222 25% 9%;

  --muted: 217 19% 18%;
  --muted-foreground: 217 10% 65%;

  --border: 217 19% 22%;
  --card: 222 22% 12%;

  --success: 142 60% 45%;
  --warning: 38 92% 58%;
  --destructive: 0 70% 60%;
}
```

These are HSL triplets for shadcn/ui's CSS-variable convention — drop them straight into `globals.css` under `:root` / `.dark`, don't reformat to hex. Logo: Vercel's default triangle mark as a placeholder until MSSN supplies a real logo — track replacing it in `STATE.md`, don't build any custom logo component around it in the meantime.

Typography: `Plus Jakarta Sans` is the body face (`layout.tsx` sets it on `body`), with the system stack as fallback; `font-mono` stays the system mono stack. Personality comes from weight and tracking, not from face-swapping. One exception: the brand wordmark uses Fraunces via `--font-brand` — it is the one serif in the product, and it is deliberately the *only* place a display face appears (docs headers stay Jakarta).

- **Display** (page heroes, `h1`): `text-4xl md:text-5xl font-bold tracking-tight`, leading-tight.
- **Card/section titles**: `text-xl font-semibold tracking-tight` (auth cards) / `text-base font-semibold` (inline cards).
- **Body**: `text-sm` inside cards, `text-base` on full-width pages; `leading-relaxed` for multi-line copy.
- **Eyebrow/utility** (role label above auth cards, section kickers): `text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground`.
- Never use gradient text or non-token colors on headings.

Spacing: 4pt rhythm. Page gutters `px-4`, content max-width `max-w-5xl` (hero copy `max-w-3xl`), hero sections `py-24 md:py-32`, form fields `space-y-4` with `space-y-2` label-to-input, auth card `max-w-md`.

Elevation: exactly two levels — (1) resting cards: `ring-1 ring-foreground/10` (shadcn Card default), (2) floating auth cards over the lattice: `shadow-xl`. Nothing else; no drop shadows on buttons/inputs.

Signature surface: the eight-point star (khatam) lattice (`components/ui/geo-lattice.tsx`), rendered full-bleed behind the landing hero and every auth screen at `text-primary/5` light / `text-primary/10` dark. This is the one identity element — don't add competing background textures, gradients, or patterns anywhere else.

Form fields: inputs sit on `bg-background` (inset against the card in dark, bordered in light) with the `--input`/`--border` tokens carrying ≥3:1 contrast against the card surface in both themes — if a token change ever weakens that, fix the token, not the component. Height `h-10` (40px, plus surrounding spacing for touch), inline errors in `text-destructive` below the field, format hints in `text-xs text-muted-foreground` above the error slot.

Component states (every interactive element): hover (`/90` fill or `bg-muted` tint), visible focus ring (`ring-ring/50` via shadcn defaults — never remove), disabled (`opacity-50` + `pointer-events-none`), submitting (label swaps to spinner + progress text, button disabled). Error messages are one generic line for auth failures (no identifier enumeration), `role="alert"`.

Icons: **lucide-react only** — the one sanctioned icon library (shadcn uses it too). Never hand-roll SVG icon paths, never use emoji as UI icons.

**Mobile-first is mandatory** (audience is overwhelmingly on phones — Nigerian students/aspirants). Author every screen at the narrow viewport first and enhance upward: Tailwind breakpoints are used mobile-first (`base`/`sm`/`md`/`lg`), never a desktop-default `md:*` that collapses badly below it. Non-negotiables: interactive targets ≥44×44px, body text ≥16px (the auth card body copy uses `text-base`), no horizontal scroll at any width, and responsive nav is the shadcn `sidebar` primitive (off-canvas Sheet on mobile via `SidebarTrigger`, fixed rail on desktop) — not a custom toggle. Touch/responsive behavior is verified (resize + device emulation), not assumed.

**Loading and motion** (Phase 15, 2026-11-15): the app has exactly three loading states, ported from the Board's reference file (`DOS Site Loader.html`, kept out of the repo). Nothing else animates for decoration.

- **Page loader** (`components/shell/page-loader.tsx` + the `.dos-*` classes in `globals.css`): brand wordmark in `--font-brand` (the already-loaded Fraunces face, matching the reference's serif brand), optional role pill, 176×112 book whose halves are `--primary` and whose spark is `--accent`, sliding progress bar, and a status line cycling every 1800 ms inside a `role="status" aria-live="polite"` region. Used by the `loading.tsx` route segments and by the client auth gates (`RequireRole`, `NotFoundShell`). `fullScreen` owns the viewport; a route segment renders at `min-h-[60dvh]` so it doesn't shove the shell's chrome around.
- **Skeleton**: the shared `Skeleton` primitive carries `.dos-shimmer` (left-to-right sweep tinted by `--dos-shimmer`), so no page defines its own shimmer.
- **Busy button**: `components/ui/spinner.tsx` (`Spinner`, a ring drawn in `currentColor`) replaces the ad-hoc lucide `Loader2` busy icons; the label stays, the button is disabled.
- **Tokens**: `--dos-shimmer` exists in both `:root` and `.dark`; every other colour in these states is an existing token from above. No raw hex, no gradient text.
- **Reduced motion**: `prefers-reduced-motion: reduce` stills all three states (third leaf pre-flipped, bar held at 60%, sweep and ring stopped) while keeping the layout identical — a loader frozen at 0% reads as a hang, not as calm. The loader rules are deliberately unlayered so they beat the global `@layer base` duration reset; if you re-layer them, the fallback silently stops working.
- **Scoped exception**: `.dos-page-loader`'s radial wash is the only gradient background outside the khatam lattice. It comes from the supplied reference and exists only inside the loader — don't copy it onto any other surface.

## 13. Changelog against original docs

- Added `quiz_attempts.released_at` and `semester_settings` — not in `DOS-Site-Database-Schema.sql`, both needed to implement resolved decisions #10 and #11 above.
- Post-UTME conversion formula (`raw / 2`) is a placeholder pending explicit Board confirmation — everything else in this document is resolved and final for MVP scope.
- Added §7a (Student deactivate / hard delete, Board decision 2026-11-15) and tightened §7 step 6: `requireAuth()` now re-reads the account row, so a deactivated or deleted account is rejected on its next request instead of continuing to work until token expiry.
- Added the §12 "Loading and motion" subsection (Phase 15, 2026-11-15): three loading states only — page loader, skeleton shimmer, busy-button spinner — with `--dos-shimmer` as the single new token, `--font-brand` (Fraunces) for the wordmark, and a `prefers-reduced-motion` fallback that keeps layout while stopping motion. Records the loader's radial wash as the one scoped exception to the "no competing gradients" identity rule.
- Added `quizzes.opens_at` / `quizzes.closes_at` (nullable, plus a `quizzes_window_check` CHECK constraint) — not in `DOS-Site-Database-Schema.sql`. Needed to implement the 2026-09-28 Board amendment to resolved decision #6, which made the weekly Course Quiz window Admin-overridable instead of fixed. Resolution lives in `lib/quizzes/window.ts` (`resolveCourseQuizWindow`); the API is `PATCH /api/admin/quizzes/[id]/window`, Admin-only, Course Quizzes only (Topic Quizzes have no window → 409).
