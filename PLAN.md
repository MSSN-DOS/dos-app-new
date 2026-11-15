# PLAN.md

Every page-building task below (anything producing a `page.tsx`) has a matching wireframe/layout/page spec in `.agents/design/` — grouped by role, indexed at `.agents/design/README.md`. Read the matching spec before starting that task; don't build a screen from the task title alone.

Phased build order. Phases are sequential — don't start a later phase before the current one's tasks are checked off in `STATE.md`, unless a task explicitly says it can run in parallel. Task IDs (`P0-1`, `P1-3`, etc.) map 1:1 to `STATE.md` rows and should be used in commit messages per `AGENTS.md` §4.

**Cross-cutting requirement — Mobile-first.** The audience is overwhelmingly on phones (Nigerian students/aspirants). Every page in this plan is authored narrow-viewport-first and enhanced upward; responsive nav uses the shadcn `sidebar` primitive (off-canvas on mobile, fixed rail on desktop). See `DESIGN.md` §12 for the full mandate; verify each screen at mobile + desktop widths before checking it off.

---

## Phase 0 — Project scaffold & tooling

Nothing product-specific yet. Get a clean, correctly-configured repo that CI passes on with zero app code.

- **P0-1** Init Next.js App Router project with TypeScript strict mode, pnpm.
- **P0-2** Configure Tailwind + shadcn/ui; drop in the design tokens from `DESIGN.md` §12 (`:root` and `.dark`).
- **P0-3** Set up Drizzle (config, connection to Supabase Postgres via `DATABASE_URL`/`DIRECT_URL`).
- **P0-4** ESLint + Prettier config, `pnpm lint` / `pnpm typecheck` scripts wired up.
- **P0-5** Vitest config, `pnpm test` / `pnpm test:watch` scripts.
- **P0-6** GitHub Actions CI (`.github/workflows/ci.yml`): install, lint, typecheck, test on every PR.
- **P0-7** `.env.example` with every variable from `README.md`, no real values.
- **P0-8** Base `app/layout.tsx`, theme provider (light/dark), empty placeholder home page.
- **P0-9** *(optional)* `.mcp.json` for the Supabase dev-project MCP connection, per `README.md` §"Connecting an agent to the DB" and `AGENTS.md` §7 — read-only by default, scoped to `dos-site-dev` only, never production.

## Phase 1 — Database schema & auth foundations

- **P1-1** Translate `DOS-Site-Database-Schema.sql` into `lib/db/schema.ts` (Drizzle), including the two deltas from `DESIGN.md` §10 (`quiz_attempts.released_at`, `semester_settings`).
- **P1-2** First migration (`pnpm db:generate` + `pnpm db:migrate`) against a real Supabase project.
- **P1-2a** Lock down PostgREST access: revoke `anon`/`authenticated` grants on `public`, enable RLS with deny-all policies on every table, confirm the app's connection role via `SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user;`. See `DESIGN.md` §11. Do this before any seeded/real-shaped data exists in the dev project — it's closing a live PostgREST side-door, not routine hardening.
- **P1-3** Seed script: four `roles` rows + one bootstrap Admin from env vars.
- **P1-4** Password hashing utility (pick bcrypt or argon2, document the choice at the top of the file) and identifier validation schemas (`lib/validation/identifiers.ts`) per `DESIGN.md` §2, with unit tests covering valid/invalid Matric and JAMB formats.
- **P1-5** JWT sign/verify helpers (`lib/auth/jwt.ts`), `requireAuth()` guard (`lib/auth/guard.ts`), shared error handler for `UnauthorizedError`/`ForbiddenError`.
- **P1-6** `POST /api/auth/register` (Student + Aspirant paths), `POST /api/auth/login`.
- **P1-7** Client-side auth: `localStorage` token storage, shared fetch wrapper (`lib/auth/client-fetch.ts`), auth context/hook for the current user.
- **P1-8** `/login`, `/register/student`, `/register/aspirant` pages.
- **P1-9** `POST /api/auth/onboarding` + `/onboarding` page (role-branching: Faculty/Department/Level for Students, Department of Aspiration for Aspirants). Depends on P2-1..P2-4 existing so there's real data to select from — build the onboarding *form* here, but it can't be meaningfully tested end-to-end until Phase 2 lands.

## Phase 2 — Academic structure (Admin) & role-guarded shells

- **P2-1** Admin route group shell (`(admin)/admin/layout.tsx`) with `requireAuth(['admin'])`, nav.
- **P2-2** Teacher, Student, Aspirant route group shells, same pattern, each with their own role check.
- **P2-3** `/admin/structure/levels` — CRUD, page + API.
- **P2-4** `/admin/structure/faculties` — CRUD, page + API.
- **P2-5** `/admin/structure/departments` — CRUD (incl. `department_levels` many-to-many picker), page + API.
- **P2-6** `/admin/structure/courses` — CRUD incl. all four `scope_type`s and the `course_faculties` picker for `interfaculty`, page + API.
- **P2-7** `/admin/teachers` — create/list Teacher accounts (`identifier_type = 'staff_id'`), page + API.
- **P2-8** End-to-end pass on P1-9's onboarding flow now that real structure data exists.
- **P2-9** Adopt TanStack Query for client server-state (decided 2026-08-24): provider in root layout, refactor levels/faculties/onboarding pages off manual fetch loops; codify the endpoint-test pattern + TanStack rule in `AGENTS.md`/`README.md`.

## Phase 12 — Quiz authoring rebuild (continuation, 2026-11-13)

This explicitly requested authoring work can proceed independently of the pending
production deployment and logo tasks. P12-1–P12-3 are already recorded as complete in
STATE.md. Work through the remaining tasks in order; do not mark one complete until
lint, typecheck and the tests pass. Preserve custom JWT auth, teacher teaching scope,
  the Course Quiz count of 50, and the Admin score-release gate (reconfirmed by the
Board in this session). The current request supersedes the earlier deferral of essay
questions and quiz images; essays require manual grading and must never be
automatically awarded a score. Quiz image uploads are separate from Admin-only
PDF/article resource uploads.

- **P12-1** Pure marks, duration and settings helpers (complete).
- **P12-2** Additive schema, RLS and generated migration (complete).
- **P12-3** Shared Zod draft/publish schemas (complete; extend for approved features).
- **P12-4** Shared Tiptap rich-text editor, KaTeX equations, full formatting toolbar,
  optional image-upload adapter, fullscreen editing, safe rich-text rendering and tests.
- **P12-5** Question cards and type chooser, passage sub-questions, manual essays,
  pointer/keyboard reorder, marks Apply, duplicate/bulk delete, and empty states.
- **P12-6** Searchable grouped settings, pinning, persisted per-user defaults and scheduling.
  Includes the authenticated preferences endpoint and its colocated tests because
  persistence is required to complete this task before P12-7.
- **P12-7** Authenticated authoring APIs for the complete builder payload, question
  marks/order, passages, manual grading, private Supabase images and preferences.
  Every endpoint receives colocated auth, validation and conflict tests.
- **P12-8** Wire Teacher/Admin pages, quiz details, sticky draft/publish actions with
  inline errors and blocker summary, student preview and runtime behavior. Update
  the page specs and verify mobile layout, keyboard access and both themes.

## Phase 3 — Question bank & quizzes (Teacher)

- **P3-1** `topics` CRUD (Admin and Teacher both, per `DESIGN.md` §3) — page + API.
- **P3-2** Question bank data layer: draft vs. publish validation split (`DESIGN.md` §4, `AGENTS.md` §3) for both `fill_in_gap` and `options` question types.
- **P3-3** `/teacher/questions` — question editor UI (rich text: bold/sub/superscript; options with add-beyond-default-two; single-correct-option enforcement).
- **P3-4** `/teacher/quizzes` — quiz list + create flow, `quiz_type` branching (Topic vs. Course), question count fixed-at-50 for Course Quiz / free-form for Topic Quiz.
- **P3-5** `/teacher/quizzes/[id]` — attach questions from the bank, configure time limit / pass mark / multiple-attempts / lose-focus policy / instructions.
- **P3-6** Student/Aspirant-facing `GET /api/quizzes` — list, server-side scoped to the caller's Faculty/Department/Level/active-Semester (Students) or all JAMB subjects (Aspirants).

## Phase 4 — Quiz-taking, grading, attempts

- **P4-1** Grading logic (`lib/scoring/grade-attempt.ts`): both question types, multi-blank handling, unit-tested thoroughly per `AGENTS.md` §5.
- **P4-2** `POST /api/quizzes/[id]/attempt` — submit an attempt, grade synchronously, write `quiz_attempts` + `attempt_answers`, update `best_scores` if it's a new high score, set `released_at = NULL`.
- **P4-3** `/quizzes/[id]/attempt` page — question-by-question UI, timer, lose-focus handling per the quiz's configured policy, reshuffling on multi-attempt quizzes.
- **P4-4** `/history` page — past attempts, best score, held-vs-released state shown honestly (no leaking a held score in the payload — verify with a test that hits the API directly, not just the UI).

## Phase 5 — Score release, CGPA / Post-UTME, leaderboard

- **P5-1** `/admin/scores/release` — list held attempts by quiz/week, release-one and release-bulk-by-week actions, page + API.
- **P5-2** CGPA computation (`lib/scoring/cgpa.ts`) triggered on release, per `DESIGN.md` §5 — unit-tested.
- **P5-3** Post-UTME computation + 50-point conversion (`lib/scoring/post-utme.ts`), with the `// TODO(board-confirm)` marker on the conversion formula per `DESIGN.md` §5.
- **P5-4** Student `/dashboard` — CGPA display, quiz list, resources link.
- **P5-5** Aspirant `/dashboard` — Post-UTME display, JAMB quiz list.
- **P5-6** `/admin/leaderboard` — separate Student and Aspirant rankings, most recent released week.

## Phase 6 — Content / resources

- **P6-1** Supabase Storage bucket wiring, folder-path helper matching `DESIGN.md` §6 exactly (Student vs. Aspirant path shapes).
- **P6-2** `/admin/content` — upload PDF / write article, scoped to a course or JAMB subject, page + API.
- **P6-3** `/resources` (Student and Aspirant versions) — browse, scoped server-side to the caller.

## Phase 7 — Semester automation

- **P7-1** `lib/semester/calendar.ts` — static 2025/26 session dates from `DESIGN.md` §8.
- **P7-2** `getActiveSemester()` resolver — auto mode (with gap-fallback behavior) + manual override read from `semester_settings`, unit-tested including the gap-fallback case.
- **P7-3** `/admin/settings/semester` — toggle auto/manual, pick override, page + API.
- **P7-4** Audit every place that filters by "active semester" (quiz list, course list, resource list) and confirm they all call the shared resolver, not an inline date check — this is a grep-and-verify task, not new logic.

## Phase 8 — Polish, admin directories, deploy

- **P8-1** `/admin/students`, `/admin/aspirants` — searchable directory with individual performance drill-down.
- **P8-2** `/admin` dashboard — counts, pending-release count, quick actions (matches the wireframe).
- **P8-3** Empty states, loading states, and error states pass for every page — not just the happy path.
- **P8-4** Accessibility pass on shadcn primitives usage (labels, focus states, keyboard nav on the quiz-taking flow especially).
- **P8-5** Vercel deployment: env vars set, connected to Supabase project, first production deploy.
- **P8-6** Replace placeholder Vercel-triangle logo once MSSN supplies a real one (tracked here so it isn't forgotten, not blocking launch).

## Phase 13 — Admin student lifecycle: deactivate and hard delete (2026-11-15)

Board decision: an Admin must be able to take a Student out of the platform at any time, regardless
of whether they have attempts, held scores or a CGPA history. Both outcomes ship — **deactivate**
(reversible, the default) and **hard delete** (permanent). Deleting must not be blocked by
performance data the way Teacher deletion is blocked by authored content: a Student authors
nothing, so their records are deleted with them.

- **P13-1** Make `requireAuth()` read live account state: one `users ⋈ roles` query returning the
  role name and `is_active`, so a deactivated or deleted account is rejected on its next request
  instead of riding a 7-day token to expiry. Deleted/nonexistent and deactivated both answer 401,
  not 403 — the token no longer represents a usable account. Add the missing unit test for the
  guard.
- **P13-2** `PATCH /api/admin/users/students/[id]` — `{ isActive }` only (mirrors the Teacher
  toggle). Deactivation is the reversible off-switch; it does not touch attempts or scores, so
  reactivating restores the account exactly as it was.
- **P13-3** `DELETE /api/admin/users/students/[id]` — one transaction removing the student's
  `quiz_attempts` (their `attempt_answers` cascade), `best_scores`, `cgpa_records`,
  `post_utme_scores`, `tour_completions`, then the `users` row (`student_profiles` and any
  preferences cascade). No approval queue, no state-based blocking.
- **P13-4** Wire `/admin/students`: status filter (all / active / deactivated), status badge,
  Deactivate/Reactivate as the normal action and Delete behind a separate danger dialog whose
  confirm button stays disabled until the Admin types the student's identifier. The dialog states
  that historical leaderboard rows for past weeks will change because rankings are computed live.
- **P13-5** Endpoint tests for the two new handlers plus the status filter: 401, 403, happy paths,
  Zod → 422 with `error.details`, 404 for an unknown or non-Student id.

---

## Explicitly out of scope for MVP (don't build these unless `PLAN.md` is updated to add them)

- Email/SMS notifications
- Refresh-token auth flow
- Playwright/e2e tests
- Multi-select options questions
- Partial credit on multi-blank fill-in-the-gap
- Any payment/subscription flow
