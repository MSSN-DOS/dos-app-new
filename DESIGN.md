# DESIGN.md — DOS Site

This is the single source of truth for how the product behaves and how the code should be shaped. Where this document and the original requirements/proposal docs disagree, **this document wins** — it reflects the alignment interview of 2026-08-22 that closed every open question.

---

## 1. Roles

`admin`, `teacher`, `student`, `aspirant` — one `roles` table, one `users` table, role-specific detail in `student_profiles` / `aspirant_profiles`. See §5 for the schema.

## 2. Resolved decisions (source of truth — supersedes Section 9 of the requirements doc)

| # | Question | Resolution |
|---|---|---|
| 1 | Admin vs Teacher publishing boundary | Teachers publish quizzes and topics directly. No Admin approval step. |
| 2 | Fill-in-the-gap grading | Case-insensitive exact match, auto-graded at submission. |
| 3 | Identifier validation | Format-validated only (regex below), no cross-check against an external membership/JAMB list. |
| 4 | Content upload permissions | Admin-only. Teachers cannot upload PDFs/articles. |
| 5 | Topic Quiz question count | Free-form — Teacher sets it per topic when building the quiz. |
| 6 | Weekly Course Quiz release window | Fixed: opens Saturday 00:00, closes Sunday 23:59 (server timezone, see §8). |
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

**JAMB Registration Number:** two accepted shapes
- Standard (10 char): 8 digits + 2 uppercase letters → `^\d{8}[A-Z]{2}$`
- Expanded (14 char): 4-digit year + 8 digits + 2 uppercase letters → `^\d{4}\d{8}[A-Z]{2}$` (equivalently `^\d{12}[A-Z]{2}$`)

Both live in `lib/validation/identifiers.ts` as named Zod refinements (`matricNumberSchema`, `jambRegNumberSchema`), reused by both the registration form and the `/api/auth/register` handler — never duplicate the regex.

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
     └─ Level (100/200/300/400/500/600 — which ones apply is per-Department)
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
| Cadence | Ad hoc, whenever a Teacher publishes one | Weekly, opens Saturday 00:00 / closes Sunday 23:59 |
| Counts toward CGPA / Post-UTME / leaderboard | No | Yes — only source that counts |

Rules that apply to both:
- Every attempt is recorded in `quiz_attempts`; only the highest `score` per `(user_id, quiz_id)` is written to `best_scores` and counts toward the official record.
- Multiple attempts are allowed only if `allow_multiple_attempts = true` on the quiz; when true, questions are reshuffled per attempt from the question bank pool.
- A question can't be published with missing text or a required option — enforce this in the Zod schema for the "publish" action specifically (the "save as draft" action has no such requirement).
- Options questions are single-select only (`attempt_answers.selected_option_id` is a single FK) — the question bank's `is_correct` flag should therefore be true on exactly one `question_option` per question; enforce this at question-creation time, not just at grading time.

### Grading

- **Options:** correct iff `selected_option_id` matches the option where `is_correct = true`.
- **Fill in the gap:** correct iff the trimmed, lowercased submitted answer matches `question_blanks.accepted_answer` (also trimmed/lowercased), regardless of `question_blanks.case_sensitive` — that column is unused under the resolved case-insensitive-always rule; keep it in the schema for future flexibility but the grading code path ignores it for MVP.
- Multi-blank questions: every blank must be correct for the question to count as correct (no partial credit for MVP).
- Score = `(questions answered correctly / question_count) * 100`, stored as `NUMERIC(6,2)` on `quiz_attempts.score`.
- Grading happens synchronously on submit — no async job queue needed at this scale.

### Score release

- On submit, `quiz_attempts.submitted_at` and `score` are written immediately, but the score is **not shown to the student/aspirant** until Admin releases it.
- Add a `released_at TIMESTAMP NULL` column to `quiz_attempts` (not in the original schema — this is a deliberate addition, see `DESIGN.md` changelog at the bottom). `NULL` = held.
- Admin release actions: release one quiz's attempts, or bulk-release all attempts for a given `week_start`. Both just set `released_at = now()` on the matching rows.
- Until released, the Student/Aspirant UI shows "Score pending" (see wireframe) — the raw score is not sent to the client at all while held, not just hidden in the UI.

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

- `content_items` (`pdf` | `article`), Admin-only to create.
- Files land in Supabase Storage under:
  - Students: `/resources/{faculty}/{department}/{level}/{semester}/{course}/`
  - Aspirants: `/resources/jamb/{subject}/`
- `content_items.body_or_file_url` stores the resulting Storage URL (or the article body directly for `type = 'article'` — treat that column as either a URL or inline markdown depending on `type`, and branch on it explicitly in the UI, never guess from the string shape).

## 7. Auth flow

1. **Register** (`POST /api/auth/register`): identifier (Matric or JAMB, format-validated per §2), full name, password. Creates a `users` row with `role_id` = `student` or `aspirant`, `identifier_type` set accordingly. Password hashed with `bcrypt` (or `argon2` — pick one in `AGENTS.md` and stick to it) before storage, never store plaintext even transiently beyond the request handler.
2. **Onboarding** (`POST /api/auth/onboarding`, requires a valid JWT from step 1's auto-login): Students select Faculty → Department → Level; Aspirants select Department of Aspiration. Writes `student_profiles` / `aspirant_profiles`. A user cannot access any role-scoped page until this row exists — enforce in middleware, not just by hiding the nav link.
3. **Login** (`POST /api/auth/login`): identifier + password → JWT (7-day expiry) signed with `JWT_SECRET`, containing `{ userId, roleId }` only — no PII in the payload beyond the numeric IDs.
4. Client stores the JWT in `localStorage`, attaches `Authorization: Bearer <token>` to every `/api` call via a shared fetch wrapper (`lib/auth/client-fetch.ts`) — never hand-roll fetch calls with the header inline in a component.
5. Every `/api` route (except `register`/`login`) verifies the JWT server-side via a shared `requireAuth(request, allowedRoles: Role[])` helper in `lib/auth/guard.ts`, which throws a typed `UnauthorizedError`/`ForbiddenError` caught by a shared error handler. No route should hand-roll its own auth check.
- Admin accounts and Teacher accounts are **not self-registered**. Admin is bootstrap-seeded (`pnpm db:seed`); Teacher accounts are created by an Admin from `/admin/teachers` (`identifier_type = 'staff_id'`, Admin sets an initial password the Teacher changes on first login — first-login-forces-password-change is a nice-to-have, not required for MVP, track it in `STATE.md` as optional).

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
- `/teacher/questions` — question bank CRUD (Fill-in-gap / Options)
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

### API surface (`/api/*`, mirrors the pages above 1:1)
- `/api/auth/register`, `/api/auth/login`, `/api/auth/onboarding`
- `/api/admin/structure/{levels,faculties,departments,courses}` — REST-style CRUD
- `/api/admin/teachers`
- `/api/admin/users/{students,aspirants}`
- `/api/admin/content`
- `/api/admin/leaderboard`
- `/api/admin/scores/release`
- `/api/admin/settings/semester`
- `/api/teacher/topics`, `/api/teacher/questions`, `/api/teacher/quizzes`, `/api/teacher/quizzes/[id]`, `/api/teacher/results/[quizId]`
- `/api/quizzes` (list, scoped server-side to the caller's role/structure — Student/Aspirant), `/api/quizzes/[id]/attempt` (POST to submit)
- `/api/me` — current user + profile + CGPA/Post-UTME summary
- `/api/resources`

Every route under `/api/admin/*` requires `role = admin`; `/api/teacher/*` requires `role = teacher`; everything else requiring auth checks role inline via `requireAuth`. No route is guarded only by folder convention — the `requireAuth` call inside the handler is the actual enforcement, folder naming is just for humans/agents navigating the repo.

## 10. Data model

Treat `DOS-Site-Database-Schema.sql` as the base schema — translate it into `lib/db/schema.ts` (Drizzle) table-for-table, column-for-column, with these deltas layered on top (all called out inline above too):

- Add `quiz_attempts.released_at TIMESTAMP NULL` (§4, score release).
- Add `semester_settings` table (§8, active semester).
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

Typography: system font stack (`font-sans` default from Tailwind/shadcn) — no custom webfont for MVP, one less thing to load/license. Personality comes from weight and tracking, not the face:

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

## 13. Changelog against original docs

- Added `quiz_attempts.released_at` and `semester_settings` — not in `DOS-Site-Database-Schema.sql`, both needed to implement resolved decisions #10 and #11 above.
- Post-UTME conversion formula (`raw / 2`) is a placeholder pending explicit Board confirmation — everything else in this document is resolved and final for MVP scope.
