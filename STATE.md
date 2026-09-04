# STATE.md

Single source of truth for "what's actually done." One row per `PLAN.md` task ID. Check a box only when the code is written, `pnpm lint` / `pnpm typecheck` / `pnpm test` all pass, and (where `PLAN.md` calls for it) tests exist. Add a one-line note under any task where something was flagged rather than resolved (see `AGENTS.md` §6) — don't leave that context only in a commit message.

Page-building tasks each have a matching spec in `.agents/design/` (indexed at `.agents/design/README.md`) — same Task ID cross-referenced both places.

Work top to bottom. Don't check a later phase's box before every task above it in an earlier phase is checked, unless `PLAN.md` explicitly says a task can run out of order.

---

## Phase 0 — Project scaffold & tooling
- [x] P0-1 — Next.js App Router + TypeScript strict + pnpm init
- [x] P0-2 — Tailwind + shadcn/ui + design tokens (light/dark)
- [x] P0-3 — Drizzle config + Supabase connection
- [x] P0-4 — ESLint + Prettier + lint/typecheck scripts
- [x] P0-5 — Vitest config + test scripts
- [x] P0-6 — GitHub Actions CI
- [x] P0-7 — `.env.example`
- [x] P0-8 — Base layout + theme provider + placeholder home page
- [x] P0-9 — (optional) Supabase dev-project MCP connection, read-only, per AGENTS.md §7
  - Boxes verified against commit `fb1a1f5` + lint/typecheck/test run on 2026-08-24 (all green); they were done but never ticked.

## Phase 1 — Database schema & auth foundations
- [x] P1-1 — Drizzle schema translated from `DOS-Site-Database-Schema.sql` (+ 2 deltas)
- [x] P1-2 — First migration applied to a real Supabase project
- [x] P1-2a — RLS lockdown: revoke anon/authenticated grants + deny-all RLS on every table (closes PostgREST side-door, see DESIGN.md §11)
  - Connection role confirmed `postgres` with `rolbypassrls = true` (so RLS never affects app traffic). Verified on `dos-site-dev`: RLS enabled on all 25 public tables, 25 deny-all policies, 0 anon/authenticated grants on `public` (the residual 58 grants in `role_table_grants` are Supabase's own `storage`/`auth` tables, not our data). The `REVOKE` block is the one sanctioned hand-edit of the generated migration — Drizzle's DSL can't express grants, and DESIGN.md §11 requires it in the same migration as the RLS enable.
- [x] P1-3 — Seed script (roles + bootstrap Admin)
- [x] P1-4 — Password hashing util + identifier validation schemas + tests
- [x] P1-5 — JWT sign/verify + `requireAuth()` guard + shared error handler
- [x] P1-6 — `POST /api/auth/register`, `POST /api/auth/login`
- [x] P1-7 — Client auth: localStorage storage, fetch wrapper, auth context
- [x] P1-8 — `/login`, `/register/student`, `/register/aspirant` pages
  - Auth UI refactored to shadcn primitives (Card/Input/Label) instead of raw HTML.
  - 2026-08-24 Board feedback pass: auth screens + landing redesigned — khatam-lattice signature (`components/ui/geo-lattice.tsx`), dark `--input`/`--border` contrast raised, landing got real CTAs + two-track cards, in-button submit spinner. `DESIGN.md` §12 expanded with type scale / spacing / elevation / states so the next screen isn't designed from five HSL variables and a hope.
- [x] P1-9 — `POST /api/auth/onboarding` + `/onboarding` page (full e2e check deferred to P2-8)
  - Onboarding form refactored to shadcn Select primitives; cascading selects tolerant of missing P2 structure endpoints (show "not available yet" empty state).
  - 2026-08-24 UI pass: moved into the shared AuthCard shell (lattice + eyebrow), proper loading/error/retry states for structure fetches, associated labels, in-button spinner.
  - Bootstrap Admin login verified against dev DB + `POST /api/auth/login` (seeded `ADM/2026/001`, role=admin, JWT returned).

## Phase 2 — Academic structure (Admin) & role-guarded shells
- [x] P2-1 — Admin route group shell + nav
  - `src/app/(admin)/admin/layout.tsx` + shared `RequireRole` client guard (`src/components/auth/require-role.tsx`) — reusable for P2-2's shells. Placeholder `/admin` page until P8-2.
  - 2026-08-24: rebuilt shell on the **shadcn `sidebar` primitive** (generated via `pnpm dlx shadcn@latest add sidebar`). Mobile-first: `SidebarTrigger` opens an off-canvas Sheet drawer on phones; fixed icon-rail on `md+`. Logo placeholder + Lucide icons per nav item. Added `TooltipProvider` to root layout (sidebar dep). shadcn `icon-sm` button size added so generated sheet/sidebar compile.
- [x] P2-2 — Teacher/Student/Aspirant route group shells
  - `(teacher)` group with Dashboard/Topics/Questions/Quizzes/Results nav; Student + Aspirant share one `(student-aspirant)` group (same URLs `/dashboard` `/history` `/resources`, same 3-item nav) guarded by `RequireRole roles={["student","aspirant"]}`. Shared `AppSidebar` (`components/shell/app-sidebar.tsx`) reuses the admin sidebar's mobile-first pattern (off-canvas Sheet below `md`). `RequireRole` extended to accept multiple roles.
  - FLAGGED (AGENTS.md §6), resolved 2026-08-24 in P2-8: the missing-profile redirect guard now lives in `components/auth/onboarding-guard.tsx` (uses `GET /auth/onboarding`, which already answers 404 for a missing profile — no `/api/me` needed). Wired into `(student-aspirant)/layout.tsx`.
- [x] P2-3 — `/admin/structure/levels` CRUD
  - Endpoint unit tests added per Board request (2026-08-24): route handlers tested directly in colocated `route.test.ts` files, DB mocked at `@/lib/db` via `src/lib/testing/route-test.ts` helpers. Same pattern applies to every new endpoint.
- [x] P2-4 — `/admin/structure/faculties` CRUD
  - Mirrors P2-3 exactly (API + page + colocated `route.test.ts`); DELETE blocked 409 on department/course/course_faculties references.
- [x] P2-9 — Adopt TanStack Query for client server-state (decided 2026-08-24)
  - `@tanstack/react-query` added; shared provider (`components/providers/query-provider.tsx`) mounted in root layout. Levels, faculties, and onboarding pages refactored from `useEffect`+`useState` fetch loops to `useQuery`/`useMutation` over `apiFetch`. Rule codified in AGENTS.md §1; endpoint-test pattern (colocated `route.test.ts`, `src/lib/testing/route-test.ts` helpers, 401/403/happy/422/409 coverage) codified in AGENTS.md §5.
- [x] P2-5 — `/admin/structure/departments` CRUD
  - API (GET list grouped with `levelIds`, POST/PATCH with `department_levels` set-replace on save, DELETE blocked 409 on courses/student-profiles refs) + page with faculty filter, faculty Select, and levels checkbox multi-select. Colocated `route.test.ts` for both endpoints; shadcn `checkbox` primitive added.
- [x] P2-6 — `/admin/structure/courses` CRUD (4 scope types + interfaculty picker)
  - API (GET list grouped with `facultyIds`, POST/PATCH with `course_faculties` set-replace on save, DELETE blocked 409 on quizzes/questions/content-items refs) + page with department/level/semester filters, semester toggle, scope-reactive field block (department select / faculty select / faculties checkbox grid ≥2), and a Zod `superRefine` mirror of the DB `courses_scope_check`. Colocated `route.test.ts` for both endpoints.
- [x] P2-7 — `/admin/teachers` create/list
  - API (GET list with published-quiz counts via flat rows counted in JS, POST creates user with `identifier_type='staff_id'` + bcrypt-hashed initial password, PATCH `[id]` deactivate/reactivate — never hard-delete, authorship refs) + page with Add-teacher dialog and Deactivate/Reactivate toggle. Colocated `route.test.ts` for both endpoints; `stubSelect` helper extended to support `.innerJoin()`/`.leftJoin()` chains and `.where().orderBy()`.
  - TODO(needs-board-decision): DESIGN.md does not lock a staff-ID format (wireframe shows "STF-014" but states no rule); validation is lenient (1–50 chars, trimmed). Tighten if the Board sets a format.
- [x] P2-8 — Onboarding flow verified end-to-end against real structure data
  - 2026-08-24, verified in-browser against dev DB: Admin created level/faculty/department through the UI; student registered → onboarded (Science → Mathematics → 100L) → `/dashboard`; already-onboarded revisit of `/onboarding` redirects away; aspirant registered (`jamb_reg_number`) → aspiration select → `/dashboard`; profile rows confirmed in DB.
  - Bug fixed en route: the onboarding page fetched option lists from `/admin/structure/*` (admin-only → 403 for students/aspirants). Added read-only `GET /api/structure/faculties|departments|levels` endpoints (any authenticated user; optional `facultyId`/`departmentId` filters) with colocated tests, and repointed the page. Also unwrapped their `{ data }` envelope in the page's queryFns — a shape mismatch there crashed rendering with `items.map is not a function`.
  - Implemented the deferred P2-2 guard: `OnboardingGuard` in `(student-aspirant)/layout.tsx` redirects to `/onboarding` when `GET /auth/onboarding` answers 404 (verified both directions in-browser).

## Phase 3 — Question bank & quizzes (Teacher)
- [x] P3-1 — Topics CRUD (Admin + Teacher)
  - API under `/api/teacher/topics` (`requireAuth(["admin","teacher"])`): GET list joined to courses for the code (optional `?courseId=` filter), POST with per-course title-uniqueness → 409 and `created_by` from the session, PATCH `[id]`, DELETE `[id]` blocked 409 on quiz/question references. New read-only `GET /api/structure/courses` (any authenticated user) backs the course picker. Page `/teacher/topics` — course Select gates the list and Add button; colocated `route.test.ts` for all three endpoints.
- [x] P3-2 — Question bank draft/publish validation split, both question types
  - `questionDraftSchema` (lenient — even an empty body saves; only the course-vs-JAMB track XOR is enforced) vs `questionPublishSchema` (strict — text required, options questions need ≥2 filled options with exactly one correct, fill-in-gap needs ≥1 blank each with an accepted answer) in `src/lib/validation/questions.ts`; the request's `status` field picks the schema (two schemas, no bypass flag).
  - `/api/teacher/questions` GET (filterable by courseId/jambSubjectId/type/status) + POST, `[id]` PATCH (options/blanks set-replaced on save) + DELETE (409-blocked on quiz attachments and recorded answers). Colocated `route.test.ts` for both endpoints (39 tests).
- [x] P3-3 — `/teacher/questions` editor UI
  - Editor dialog with type toggle (locked once created), bold/sub/superscript toolbar over a `contentEditable` body, options list with single-correct radio, FIG blanks with add/remove, course/topic vs JAMB-subject track toggle. "Publish" stays disabled with a live blocker list mirroring the publish schema; "Save as draft" always available. List filters by course/type/status; status shown as a pill per row.
  - Backing endpoints: `GET /api/teacher/questions/[id]` detail (row + options + blanks) and read-only `GET /api/jamb/subjects`; both colocated-tested.
  - Verified in-browser with a teacher account: fill-in-gap published, options question drafted then edited back with text/options/correct-radio intact, live publish blockers update while typing, filters narrow the list correctly.
  - Two bugs found during browser verification and fixed: the contentEditable had no `onInput`, so publish blockers never reacted to typing; edit seeding used `setTimeout(0)`, which could fire before Radix mounts the dialog content — seeding now happens in the ref callback via a pending-body holder.
- [x] P3-4 — `/teacher/quizzes` list + create (Topic vs. Course)
  - `quizCreateSchema` (src/lib/validation/quizzes.ts) mirrors both DB checks: XOR course/JAMB track, topic quiz requires a topic and forbids a week start, course quiz requires a Saturday `weekStart` in YYYY-MM-DD. POST inserts a draft shell with `timeLimitMinutes: 30` / `passMark: 50` placeholders (builder edits them in P3-5); `questionCount` uses the DB default 50. GET supports `?type=` / `?courseId=` filters with left joins so JAMB quizzes keep their row.
  - Page: type toggle + course/JAMB track toggle, topic Select gated on course choice, week-start date input for course quizzes; "Create & continue" routes straight into the builder. List rows show type · code/subject · week · count with a status pill; filters by type/course.
  - Verified in-browser as teacher: created "Algebra Basics" course quiz for MAT 101, week 2026-08-29 → redirected to builder URL, row listed correctly (`Course Quiz · MAT 101 · 2026-08-29 · 50 questions`, Draft), DB row confirmed with defaults intact.
- [x] P3-5 — `/teacher/quizzes/[id]` builder (attach questions, config)
  - API: `GET/PATCH /api/teacher/quizzes/[id]` (detail includes attached questions; PATCH enforces course-quiz rules route-level — fixed 50 questions, required Saturday week start, topic quizzes reject a week start via `quizUpdateSchema`), `POST .../questions` attach (409 on duplicate link), `DELETE .../questions/[questionId]` detach (404 when not attached), `POST .../publish` (gates on attached count vs `questionCount`). Added `?topicId=` filter to the question-bank list for the builder's topic filter. Colocated tests for all four endpoints.
  - Builder page: settings form (question count locked at 50 and read-only for course quizzes, free-form for topic quizzes; multiple attempts checkbox; lose-focus select; week-start only on course quizzes) + bank panel with topic/type filters, add/remove rows, live "N of M attached" blockers box driving the disabled Publish button.
  - Verified in-browser as teacher: attach/detach updates counts without a reload (fixed an invalidate key mismatch — detail key uses the string `useParams` id, invalidations were passing the numeric id), config save persists after reload, publish stays blocked with an accurate "Attach N more" message, topic quiz created end-to-end (free-form count target respected).
  - Bug found during verification: `quizCreateSchema.weekStart` rejected explicit `null`, so topic-quiz creation from the UI failed with 422 — schema now `.nullish()`.
- [x] P3-6 — `GET /api/quizzes` scoped list (Student + Aspirant)
  - Built the missing `getActiveSemester()` resolver first (`lib/semester/`): `SESSION_CALENDAR` dates + `resolveSemesterForDate` pure function (gap fallbacks per DESIGN.md §8) + manual-override support from `semesterSettings`; unit-tested including both gap fallbacks and override precedence.
  - Route: aspirants get published JAMB-subject quizzes flat; students get published course quizzes matching their level, active semester, and scope visibility (department → their dept; faculty/general/interfaculty rules via `course_faculties`); no student profile → 404 "Complete onboarding first". Colocated tests cover both branches plus scoping.
  - Verified live against the dev server: onboarded student → `{ data: [] }` (nothing published yet), aspirant → `{ data: [] }`, unauthenticated → 401, registered-but-not-onboarded student → 404 with the onboarding message.

## Phase 4 — Quiz-taking, grading, attempts
- [x] P4-1 — Grading logic + unit tests (both types, multi-blank)
  - `lib/scoring/grade-attempt.ts`: pure grader — options (single-select, exactly-one-correct enforced; data violations never award a point) and fill-in-the-gap (trimmed/lowercased exact match, `case_sensitive` ignored, all blanks required, no partial credit). Score = correct/total × 100 rounded to 2 dp. 13 tests covering both types, multi-blank, unanswered, fractional rounding, empty quiz.
- [x] P4-2 — `POST /api/quizzes/[id]/attempt`
  - Auth (student+aspirant) → published-only (else 404) → role branch: aspirant needs a JAMB quiz (403 otherwise), student passes `studentCanAccessQuiz` scope check (403 "not available to you") → single-attempt guard 409 → grades only attached questions via `gradeAttempt`, stores attempt + per-blank answer rows, upserts best score (never lowered). Response NEVER contains the score: `{ attemptId, scoreStatus: "held", message }` per DESIGN §4 held rule.
  - **Schema delta:** added nullable `attempt_answers.blank_index` (integer). The original `.sql` has only one `text_answer` column per answer row, which cannot store multi-blank FIG answers; `blank_index` identifies which blank each row records. Documented here as the second intentional delta after `released_at`. Migration `drizzle/0002_blushing_zaladane.sql` generated and applied to the dev DB.
  - New helpers: `lib/validation/attempts.ts` (submit schema), `lib/quizzes/access.ts` (`studentCanAccessQuiz`: level + active semester + dept/faculty/general/interfaculty visibility).
  - 11 colocated tests: 401/403×3/422 w/ details/404/409/held-shape happy paths. 369 tests green. Live e2e verified below in P4-3 note context.
- [x] P4-3 — `/quizzes/[id]/attempt` page (timer, lose-focus, reshuffle)
  - GET starts or resumes a server-timed open attempt, returns safe question content only, and deterministically reshuffles questions for multiple-attempt quizzes using the attempt ID. POST finalizes the open attempt, enforces the timer and Course Quiz Saturday-Sunday window, grades attached answers, stores per-blank answers, and keeps the score held. Atomic `submitted_at IS NULL` finalization prevents concurrent double submission.
  - Page is mobile-first and one-question-at-a-time with options/fill-in-gap answers, server-derived countdown, last-minute warning, ignore/warn/auto-submit lose-focus behavior, confirmation dialog, retry/error/expired states, and no numeric score leakage. Uses TanStack Query and `apiFetch`.
  - Verified with 375 passing Vitest tests, `pnpm lint`, `pnpm typecheck`, `git diff --check`, and live unauthenticated API/browser checks: `/api/quizzes/1/attempt` returns 401 and `/quizzes/1/attempt` redirects to `/login`. Authenticated live attempt flow requires a seeded eligible student/aspirant account and matching published quiz data.
- [x] P4-4 — `/history` page (held-vs-released verified via direct API test)
  - `GET /api/me/attempts` returns submitted attempts with role-specific Course/JAMB filters and visible best scores. Held Course Quiz rows omit both `score` and `bestScore` at the API boundary; released Course and Topic Quiz rows include them.
  - Shared mobile-first page uses TanStack Query and `apiFetch`, with quiz-type and Course/JAMB filters, loading/empty/error states, attempt dates, score-pending labels, released percentages, and best scores.
  - Verified with 380 passing Vitest tests, `pnpm lint`, `pnpm typecheck`, `git diff --check`, a direct held-score omission test, live unauthenticated API 401, and `/history` redirect to `/login`. Authenticated rendering requires seeded eligible attempt data.

## Phase 5 — Score release, CGPA / Post-UTME, leaderboard
- [x] P5-1 — `/admin/scores/release` (per-quiz + bulk-by-week)
  - `GET /api/admin/scores/held?week=` groups held (submitted, unreleased) attempts per quiz with course code / JAMB subject labels; `POST /api/admin/scores/release` accepts `{quizId}` or `{weekStart}`, sets `released_at = now()` on matching held attempts, then synchronously recomputes CGPA and Post-UTME for every affected `(user, week)` — the response reports released count plus per-week `cgpaUsers` / `postUtmeUsers` so the caller can confirm both happened.
  - Mobile-first page (`src/app/(admin)/admin/scores/release/page.tsx`) with week select, per-quiz rows ("CODE — Course Quiz | N attempts held | Release this quiz"), primary bulk-release button for the selected week, loading/empty/error/releasing states, a "Recently released" sub-list, and TanStack Query + `apiFetch`.
  - Recompute logic in `src/lib/scoring/apply-release.ts`: a best_score counts only when that user has a released attempt for the quiz; visibility is not re-checked because best_scores only exist for quizzes already access-checked at attempt time. Route-test helper `stubInsert` extended to cover `.onConflictDoUpdate()` upserts.
  - Verified with 392 passing Vitest tests (incl. colocated route tests: 401/403/404/422/happy paths), `pnpm lint`, and `pnpm typecheck`.
- [x] P5-2 — CGPA computation + tests
  - `src/lib/scoring/cgpa.ts`: unweighted mean of a user's eligible best scores, rounded to 2 decimals (`cgpa_records` NUMERIC(4,2)); unit-tested for means, rounding, numeric-string DB values, per-user isolation, and empty input.
- [x] P5-3 — Post-UTME computation + conversion (✅ formula confirmed 2026-08-25)
  - `src/lib/scoring/post-utme.ts`: mean raw score plus `convertToPostUtmeScale()`. Board-confirmed: the aggregate is out of 100 and best_score is already a percentage (which for the 50-question quiz equals correct × 2), so the conversion is the identity — kept as a function so a future scale change touches one place.
  - `post_utme_scores.converted_score_50` widened to `numeric(5,2)` in migration `drizzle/0003_chemical_deadpool.sql` so a perfect 100 fits (numeric(4,2) capped at 99.99); column name kept for data continuity. Migration generated but **not yet applied** to the dev DB.
- [x] P5-4 — Student `/dashboard`
  - New `GET /api/me` route: user + role, active semester, student profile (faculty/department/level + latest released CGPA or null — never a fake 0.00 — and quizzes-taken count) or aspirant profile (aspiration department + latest Post-UTME); colocated route test covers 401, student/aspirant happy paths, no-CGPA-yet, un-onboarded student, admin.
  - `src/app/(student-aspirant)/dashboard/page.tsx`: TanStack Query over `/me`, `/quizzes`, `/me/attempts`; stat cards (CGPA "—" when nothing released, quizzes taken), registered-as block, Harmattan/Rain active/inactive pills, Topic Quiz list ("practice, doesn't count") and Course Quiz list with Open links; course quizzes whose latest attempt has no score render a non-link "Score pending" pill (held-score rule enforced via API shape, not UI trust). Loading/error/empty states per spec; aspirant track shows a neutral placeholder until P5-5.
  - Verified with 445 passing Vitest tests, `pnpm lint`, `pnpm typecheck`.
- [x] P5-5 — Aspirant `/dashboard`
  - `GET /api/me` aspirant profile extended with `quizzesTaken` (best_scores count); route test updated.
  - Aspirant branch of the dashboard page: Post-UTME stat card (converted score `/100`, "—" when nothing released — same held rule as Student CGPA), quizzes-taken card, registered-as block (JAMB reg number · name · aspiring department), JAMB-subject quiz list (subjectName labels) with Open pills. No semester indicator (aspirants sit outside the semester structure per DESIGN.md §3).
- [x] P5-6 — `/admin/leaderboard` (separate Student/Aspirant rankings)
  - New `GET /api/admin/leaderboard?track=student|aspirant&week=` (admin-only): student track reads cgpa_records ranked by CGPA desc, aspirant track post_utme_scores by converted score desc; week defaults to most recent released week; response carries deduped released `weeks` list for the picker; tracks never merge (DESIGN.md §5). Colocated route test: 401/403/422 ×2, both happy paths, explicit-week, empty.
  - `src/app/(admin)/admin/leaderboard/page.tsx`: Student/Aspirant tabs, week select defaulting to most recent released week, ranked table (Rank | Name | CGPA or Post-UTME /100), loading/empty/error/retry states, TanStack Query + `apiFetch`.
- **P5 live-verify fixes (2026-08-25):**
  - `cgpa_records.cgpa_value` widened numeric(4,2) → numeric(5,2) in schema + migration `drizzle/0004_chilly_susan_delgado.sql` — a perfect 100.00 overflowed the old column and crashed release recompute. Migration 0003 (converted_score_50 widen) **and** 0004 now applied to the dev DB via `pnpm db:migrate`.
  - Fixed pre-existing bug in `GET /api/quizzes` student branch: visibility conditions were AND-ed together (`general AND department-match…`) so the list was always empty; they are now OR-ed via `or(...accessConds)`. Colocated endpoint test (`src/app/api/quizzes/route.test.ts`) covers both branches incl. student scoping — earlier "no colocated test" flag is resolved.
  - Live-verified in browser on dev DB: Student dashboard shows released CGPA ("100", week-labeled), registered-as block, semester pills, Topic/Course sections with Open link for released quiz; Aspirant dashboard shows Post-UTME "—", JAMB reg + aspiring-department block, empty-state quiz list (no semester pills); Admin leaderboard shows Student ranking (#1 / 100 / week of 2026-08-22) after exercising submit → held → release flow end-to-end, and correct empty states per track when nothing is released.

> **P5-3 note:** `converted_score_50 = round(raw / 2)` is a placeholder pending explicit Board confirmation (`DESIGN.md` §5, `AGENTS.md` §6). Don't check this box as "fully done" without also flagging it back to the Board — code-complete and product-confirmed are different things here.

## Phase 6 — Content / resources
- [x] P6-1 — Supabase Storage bucket + folder-path helper
  - `src/lib/storage/content-paths.ts`: pure §6 path builders (`resources/{faculty}/{department}/{level}/{semester}/{course}` / `resources/jamb/{subject}`, slugified segments) + unit tests.
  - `src/lib/storage/supabase-storage.ts`: server-only Storage client over REST/fetch (no SDK dep), service-role key, **private** `resources` bucket (per DESIGN.md §11 "app-scoped access only" principle, confirmed by Board 2026-08-25); downloads go through 10-minute signed URLs generated at read time, never public links.
- [x] P6-2 — `/admin/content` upload/post flow
  - `POST /api/admin/content` (multipart for PDF → Storage at §6 path → `content_items`; JSON for article → body stored inline in `body_or_file_url` per DESIGN.md §6 dual-use column rule). Scope XOR enforced via Zod `superRefine` mirroring `content_items_track_check`; PDF validated at route boundary (type + 20 MB cap — size chosen 2026-08-25, spec gave no number). `GET` list w/ labels, `DELETE [id]` removes the Storage object too. Colocated tests (20).
  - Page: type Tabs, title/file-picker/markdown body, Students-by-course vs Aspirants-by-subject scope Selects fed by the read-only structure endpoints, in-button uploading state, existing-content list with AlertDialog delete confirm. shadcn `textarea` installed.
  - `apiFetch` extended: skips the default JSON Content-Type for FormData bodies so multipart boundaries work.
- [x] P6-3 — `/resources` (Student + Aspirant versions)
  - `GET /api/resources`: student branch mirrors `/api/quizzes` scoping exactly (profile 404, level + active semester via shared resolver, OR-ed dept/faculty/general/interfaculty visibility, optional `?courseId=`); aspirant branch lists JAMB-subject items (optional `?jambSubjectId=`). PDF rows carry a fresh signed URL (`fileUrl`) and never the raw object path; articles carry their markdown `body`. Colocated tests (7).
  - Shared mobile-first page: course filter (students) / subject filter (aspirants), Download opens the signed URL in a new tab ("File unavailable" fallback if signing failed), articles expand inline via `<details>`, loading skeleton/empty/error-retry states, TanStack Query + `apiFetch`.
  - FLAGGED (AGENTS.md §6): DESIGN.md §6 doesn't say what fills the faculty/department path segments for **general/interfaculty** courses (they have neither row); the storage path uses the course's `scope_type` as a stand-in. Cosmetic unless paths are ever surfaced to users — tighten if the Board cares.
  - Live-verified end-to-end in browser on dev DB (2026-08-25): unauth 401s on both endpoints, admin publish (article + multipart PDF) → list → delete via UI, student scoping (rain-semester TST101 visible, harmattan MAT101 hidden, dept-2 empty), aspirant empty state + subject filter mode, and the full PDF path (multipart upload → Storage object `resources/department/mathematics/100/rain/tst-101/test-e2e.pdf` → signed URL download 200). Two storage-client bugs found & fixed during verification: Storage REST calls now send both `Authorization: Bearer` **and** `apikey` headers (new-style `sb_secret_` keys are rejected with "Invalid Compact JWS" without the apikey header), and `createResourceSignedUrl` prefixes Supabase's relative `signedURL` with `{url}/storage/v1` (the raw value has neither host nor prefix).

## Phase 7 — Semester automation
- [x] P7-1 — Static 2025/26 session calendar config
  - `lib/semester/calendar.ts`: `SESSION_CALENDAR` (Harmattan Oct 20 → Feb 6, Rain Feb 23 → Jul 3) + pure `resolveSemesterForDate()` with both gap fallbacks (pre-session → Harmattan, inter-gap → just-ended semester, post-session → Rain). Was built during P3-6; verified this pass.
- [x] P7-2 — `getActiveSemester()` resolver + tests (incl. gap-fallback)
  - `lib/semester/index.ts`: reads the single `semester_settings` row, returns `manualOverride` only in manual mode, else date resolution. Unit-tested for override precedence, stale-override-in-auto, missing-row fallback, and all gap-fallback cases. Built during P3-6; verified this pass.
- [x] P7-3 — `/admin/settings/semester` auto/manual toggle
  - `GET/PATCH /api/admin/settings/semester` (admin-only): GET returns the row or the `{ mode: "auto", manualOverride: null }` default pre-first-write; PATCH upserts row id=1 via `onConflictDoUpdate`, stamps `updatedBy` from the session, and clears any stored override when saving auto so a stale override never implies it's in force. `semesterSettingsUpdateSchema` (`lib/validation/semester-settings.ts`): `.strict()`, manual mode requires an explicit override via `superRefine`.
  - Page: Mode select (Auto calendar-driven / Manual override), override Select shown only in manual mode, live explainer of what drives the active semester, last-updated stamp, loading/saving/error/retry states, TanStack Query + `apiFetch`. Form values stay server-authoritative until edited (no effect-driven mirroring — `react-hooks/set-state-in-effect` forbids it); edits reset on successful save.
  - Colocated route tests (12): GET row/default, PATCH upsert both modes, auto-clears-override asserted on the written values, 422 manual-without-override, 422 unknown mode / extra field, 401, 403.
- [x] P7-4 — Audit pass: every active-semester filter uses the shared resolver
  - Grep-audited: `getActiveSemester()` is called by every semester-scoped path (`/api/quizzes`, `/api/resources`, `/api/me`, `/api/admin/content`, `lib/quizzes/access.ts`). No file outside `lib/semester/` references `SESSION_CALENDAR` or `resolveSemesterForDate`; remaining `new Date()` uses are timestamping (`startedAt`/`submittedAt`/`releasedAt`) or the injectable `now` param of the quiz week-window helper — none derive the active semester inline. Audit clean, no fixes needed.

## Phase 8 — Polish, admin directories, deploy
- [x] P8-1 — `/admin/students`, `/admin/aspirants` directories
  - APIs: `GET /api/admin/users/students` (search ilike name/identifier, faculty/department/level filters, latest CGPA per student from `cgpaRecords` last-week-per-user), `GET /api/admin/users/students/[id]` (profile + CGPA history + attempt history with Released/Held status — Admin is allowed to see held scores; the held-score rule binds Student/Aspirant clients only), `GET /api/admin/users/aspirants` (+latest Post-UTME converted /50), `GET /api/admin/users/aspirants/[id]`. All admin-only via `requireAuth`, Zod query validation (`lib/validation/users.ts`), paginated.
  - Colocated route tests: 30 across the four routes + dashboard (happy paths incl. pagination slicing and null-history cases, no-second-select-on-empty, 422 invalid query/pagination/id, 404, 401, 403).
  - Pages: `/admin/students` (search + Faculty/Department/Level selects, departments client-filtered by chosen faculty), `/admin/aspirants` (search only), plus `[id]` drill-downs showing stat cards, weekly histories, and attempt tables. Loading skeletons (`aria-busy`), error + Retry (`role=alert`), empty states with clear-filters actions on every page.
- [x] P8-2 — `/admin` dashboard
  - `GET /api/admin/dashboard` returns `{ counts: { students, aspirants, teachers }, pendingReleases }`; pendingReleases = submitted attempts with `releasedAt IS NULL`.
  - Page replaces the placeholder: clickable stat cards → directories/teachers, pending-releases card with count pill + "Review releases" → `/admin/scores/release`, quick actions (Upload PDF/Article → content, Manage Teachers).
- [x] P8-3 — Empty/loading/error states across all pages
  - Audited every client page using TanStack Query (23 files): all have loading (`isPending` skeletons), error (`isError` + retry or inline alert), and empty-state handling where a list can be empty. Form-style pages (onboarding, semester settings) intentionally have no list-empty state.
- [x] P8-4 — Accessibility pass
  - New pages: every input/select paired via `Label htmlFor`; ≥44px (`min-h-11`) touch targets; focus-visible rings on interactive cards/links; `aria-busy` loading regions, `role=alert` errors, `role=status` warnings, `aria-live=polite` quiz timer; lists use `role=list` / table semantics with `aria-label`s; pagination `<nav aria-label>`.
  - Quiz flow re-checked: native radio inputs inside labels (keyboard-navigable), fill-in-blank inputs have `aria-label` per blank, submit confirm dialog via shadcn AlertDialog (focus-trapped).
- [ ] P8-5 — Vercel production deploy (needs user involvement: Vercel project + env vars)
- [ ] P8-6 — Replace placeholder logo (not launch-blocking)

---

## Open items still needing a real answer from the Board (not blocking dev, but don't let these go silently forgotten)

- [x] Confirm Post-UTME conversion formula (P5-3) — confirmed 2026-08-25: aggregate is out of 100, conversion is the identity (best_score is already a percentage = correct × 2 for the 50-question quiz)
- [ ] Supply a real MSSN logo (P8-6)
- [ ] Confirm exact 2026/27+ session semester dates before that session starts (P7-1's calendar will need a yearly update — this is expected maintenance, not a bug)
