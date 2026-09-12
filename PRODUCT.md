# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary — Students (Unilorin undergraduates) and Aspirants (JAMB candidates), equal priority.** Both tracks are first-class and overwhelmingly mobile. Students are enrolled undergraduates navigating Faculty → Department → Level → Semester → Course; Aspirants are JAMB candidates organized flat by JAMB subjects. Both use DOS Site between lectures and on commutes to take weekly Course Quizzes, revise with ad-hoc Topic Quizzes, browse scoped resources, and track performance (CGPA for Students, Post-UTME score on Unilorin's 50-point scale for Aspirants) — primarily on phones.

**Secondary — Teachers** create topics, author question banks (options / fill-in-the-gap), build and publish quizzes, and review per-quiz results. **Admins (Board of Studies)** own the academic catalogue, manage teacher accounts, publish content resources, and control score release and active-semester settings. Both operate from desktop and mobile but teacher/admin work skews larger viewport.

## Product Purpose

Free e-learning and weekly quiz platform for MSSN Unilorin's Board of Studies. Gives Students and Aspirants a single, curriculum-faithful place to practise, get assessed, and see where they stand — without paywalls or subscriptions. Success means: aspirants arrive better prepared for Post-UTME, students sustain course mastery week over week, and the Board can observe engagement and performance (leaderboards, CGPA/Post-UTME trends, pending releases) without manual spreadsheet work.

## Positioning

The only free platform whose academic structure is owned and entered by the MSSN Board itself — every Faculty, Department, Level, Course, and topic maps to Unilorin's real catalogue (including department/faculty/general/interfaculty scope), not a generic subject list. Weekly Course Quizzes are fixed-format (50 questions, Sat 00:00–Sun 23:59), held on submission and released by Admin, and are the sole feed for CGPA and Post-UTME calculations. No competitor can truthfully claim Board-authored Unilorin structure plus held-then-released performance tracking in one place.

## Operating Context

- **Cadence:** Topic quizzes ad-hoc; Course quizzes weekly (fixed Saturday–Sunday window, server timezone). Scores recomputed synchronously on Admin release, not by cron.
- **Environments:** Mobile-first usage (Nigerian students/aspirants on phones); admin/teacher authoring on desktop and mobile. Offline is not an MVP requirement; no native app wrapper.
- **Tools & flows:** Register with Matric (`YY/FF/DD###`) or JAMB Reg (8+2 or 12+2) identifier → onboarding (Faculty/Dept/Level or aspiration department) → dashboard (scoped quizzes/resources/history) → attempt → "Score pending" until Admin release → history/leaderboard. Teachers publish directly; no approval queue.
- **Content storage:** Admin-uploaded PDFs/articles to Supabase Storage under `/resources/{faculty}/{department}/{level}/{semester}/{course}/` and `/resources/jamb/{subject}/`.
- **Active semester:** Auto-resolved from 2025/26 calendar via single `getActiveSemester()` resolver with manual Admin override as safety net.

## Capabilities and Constraints

**Confirmed capabilities:** Role-based auth (student/aspirant/teacher/admin); academic structure CRUD; teacher topic/question-bank/quiz authoring; single-select options + case-insensitive exact-match fill-in-the-gap grading; multiple attempts with reshuffle when enabled; held score release (per-quiz and bulk-by-week) with synchronous CGPA/Post-UTME recompute; scoped resources and dashboards; admin leaderboards (separate Student/Aspirant tracks); in-app notifications only for MVP.

**Technical constraints:** Next.js App Router + TypeScript strict + Tailwind + shadcn/ui; pnpm; Drizzle ORM over Supabase Postgres (RLS deny-all + revoked anon grants, Next.js API is sole access path); Zod validation (single schema reused client and server); custom JWT `Authorization: Bearer` (7-day expiry, `localStorage`, no refresh); TanStack Query for client server-state; `lib/auth/guard.ts` `requireAuth()` is enforcement for every `/api` route except register/login.

**Terminology:** Faculty, Department, Level (100–600 per-Department), Course `scope_type` (department/faculty/general/interfaculty), Topic, Course Quiz vs Topic Quiz, `released_at` null=held, `week_start`, `best_scores`, `cgpa_value` / `converted_score_50`.

**Undecided:** Post-UTME conversion `round(raw/2)` is a placeholder pending Board confirmation — marked `TODO(board-confirm)` in code and STATE.md.

## Brand Commitments

Name: DOS Site (MSSN Unilorin Board of Studies). Tokens are the durable identity: primary blue `217 91% 45%`, accent orange `27 96% 55%` (full light/dark scales in `DESIGN.md` §12 → `globals.css` `:root`/`.dark`), system font stack, 4pt rhythm, two-level elevation, eight-point star (khatam) lattice as signature surface (`components/ui/geo-lattice.tsx` at `text-primary/5` light). Logo is currently Vercel placeholder triangle pending MSSN asset. Voice: clear, institutional, encouraging — no invented testimonials or claims.

## Evidence on Hand

Real catalogue owned by Board via Admin UI (no seeded Faculties/Departments/Courses). Seed creates only four `roles` rows + one bootstrap Admin. No production content/quiz fixtures committed. `DOS-Site-Database-Schema.sql` is base schema reference; `DESIGN.md` is authoritative where they differ. No case studies, testimonials, or press to cite — do not fabricate.

## Product Principles

1. **Mobile-first, always.** Ship narrow viewport first; every interactive target ≥44×44px, body ≥16px, no horizontal scroll.
2. **Board truth over generic content.** Structure fidelity and held-release integrity outrank feature richness.
3. **Correctness before convenience.** Grading, CGPA, and semester resolution are unit-tested; never hide a held score client-side only.
4. **One way to do auth and validation.** Single JWT guard, single Zod schema, single semester resolver — no parallel paths.
5. **Free and focused.** No payments, no email/SMS for MVP, no second component kit — do one job well.

## Accessibility & Inclusion

Optimized for low-bandwidth mobile use. WCAG 2.1 AA as baseline: keyboard operable, focus visible, lucide-react icons with accessible names, form labels and error associations. Primary languages English; no i18n for MVP. Touch targets and readable type are product requirements, not polish.
