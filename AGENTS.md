# AGENTS.md

You are working in the DOS Site codebase. This file is a rulebook, not a suggestion — every rule below exists because a specific decision was made and closed during an alignment interview on 2026-08-22. Do not silently deviate from anything here, even if you think you know a better pattern. If you genuinely believe a rule is wrong, say so and stop — don't just do it your way and move on.

Read `DESIGN.md` before touching any code that isn't a pure config/scaffold file. It has the data model, route map, and business rules. This file has the *how to work* rules.

## 0. Before you write any code

1. Open `STATE.md`. Find the next unchecked task, in order, respecting its listed dependencies.
2. Open `PLAN.md`, find that task's phase, and read the phase description in full.
3. Do only that task. Do not "while I'm in here" refactor unrelated code, upgrade unrelated dependencies, or start a later phase's work early because it seemed convenient.
4. When the task is done — code written, tests passing, lint/typecheck clean — check its box in `STATE.md` in the same change. A task is not done until its checkbox is checked; a checked box that doesn't actually work is worse than an honest unchecked one.

## 1. Hard technical constraints — never violate these

- **Package manager is pnpm.** Never generate a `package-lock.json` or `yarn.lock`. If you see one, something's wrong — flag it, don't quietly delete it and move on.
- **ORM is Drizzle.** Never add Prisma, TypeORM, raw `pg` queries scattered through route handlers, or any other ORM/query builder. All queries go through `lib/db/`.
- **Auth is custom JWT**, not Supabase Auth, not Firebase Auth, not NextAuth/Auth.js. The `Authorization: Bearer <token>` header pattern and `lib/auth/guard.ts`'s `requireAuth()` helper are the only sanctioned auth mechanism. Do not add a second one "to make it easier," even temporarily.
- **Validation is Zod**, and only Zod. A Zod schema for a resource lives once, in `lib/validation/`, and is imported by both the form (client) and the API route handler (server) that touch that resource. Never redefine the same validation twice.
- **Styling is Tailwind + shadcn/ui.** Don't add another CSS-in-JS library, don't add a second component kit. **shadcn-first: before hand-writing any UI primitive or pattern (sidebar, sheet/dialog, table, tabs, toast, dropdown…), check the shadcn registry and install it via the CLI (`pnpm dlx shadcn@latest add <component>`).** Hand-roll only when no shadcn equivalent exists. shadcn primitives in `components/ui/` are generated, not hand-authored — don't invent a parallel component API style, and don't re-implement what a generated primitive already does (e.g. responsive nav belongs in the `sidebar` primitive with `SidebarTrigger`, not a custom mobile toggle).
- **Colors always resolve to the CSS variable tokens in `DESIGN.md` §12.** Never write a raw hex/hsl value directly in a component or a Tailwind class. If a token you need doesn't exist yet, add it to `globals.css` in both `:root` and `.dark`, don't work around it with an inline style.
- **Mobile-first is the default, non-negotiable.** The audience is mostly on phones (Nigerian students/aspirants). Author every screen for the narrow viewport first, then enhance for larger screens — Tailwind responsive classes must be written mobile-first (`base` → `sm` → `md` → `lg`), never `md:*` with a desktop-only default that breaks below it. Every interactive target is ≥44×44px, body text ≥16px on mobile, and no horizontal scroll. Touch/responsive behavior is verified, not assumed.
- **Every `/api` route handler calls `requireAuth()` (or is one of the three explicitly public auth routes: register, login).** No route relies on folder placement alone for access control — that's a convenience for humans reading the repo, not the actual enforcement mechanism.
- **Never hand-roll a `fetch()` call with the auth header inline in a component.** Use the shared client fetch wrapper (`lib/auth/client-fetch.ts`) so the header, base URL, and error handling stay in one place.
- **Client server-state fetching is TanStack Query, exclusively** (decided 2026-08-24). No new `useEffect` + `useState` + `fetch` loops in client components — use `useQuery`/`useMutation` with the shared provider (`components/providers/query-provider.tsx`). `apiFetch` stays as the transport layer inside `queryFn`/`mutationFn`; it does not get bypassed. Loading/error/empty states come from query state (`isPending`, `isError`, `refetch()`), not manual reload counters or effect-driven state machines.

## 2. Database & migrations

- `lib/db/schema.ts` is the single source of truth for table shape. `DOS-Site-Database-Schema.sql` is the original reference doc it was translated from — if they ever disagree, `DESIGN.md` §10 tells you which deltas are intentional; everything else should match the `.sql` file exactly.
- Never hand-edit a generated file under `drizzle/`. Change `schema.ts`, then run `pnpm db:generate` to produce the migration.
- Never write a migration that drops or renames a column with data in it without calling that out explicitly in the PR/commit description — this is a real platform with real user data once it's live, not a throwaway prototype.
- **Every new table ships with RLS enabled and a deny-all policy for `anon`/`authenticated` in the same migration that creates it** — this app never uses Supabase Auth, so nothing else will ever configure RLS for you, and Supabase's default project setup grants those roles PostgREST access on the `public` schema regardless. There is no table in this app that should be reachable via PostgREST/GraphQL directly — the Next.js API is the only sanctioned access path, always. See `DESIGN.md` §11 for the full policy and why it's two layers (revoked grants + RLS), not one.
- Seed data (`pnpm db:seed`) creates the four `roles` rows and one bootstrap Admin from `BOOTSTRAP_ADMIN_IDENTIFIER` / `BOOTSTRAP_ADMIN_PASSWORD`. It does not create fake Faculties/Departments/Courses — that's real Board data entered through the Admin UI, don't invent placeholder academic structure and leave it in a seed script that might accidentally run against a real deployment.

## 3. Business logic — non-negotiable rules

These come straight out of `DESIGN.md` §2–8. Restating the ones most likely to get silently "simplified" by a model under time pressure:

- Fill-in-the-gap grading is **always** case-insensitive exact match, trimmed. Do not add stemming, fuzzy matching, or "close enough" logic.
- Only **Course Quiz** results feed CGPA, Post-UTME, and the leaderboard. Topic Quiz results never touch those calculations, even if it would be "easy" to include them for a richer average.
- Quiz scores are **held** on submission (`released_at = NULL`) until an Admin explicitly releases them. Never return a raw score to a Student/Aspirant client for an unreleased attempt — check this server-side in the API response shape itself, not just by hiding it in the UI. An unauthenticated curl request to the attempt endpoint should not leak a held score either.
- Options questions are single-select. Exactly one `question_options` row per question should have `is_correct = true` — validate this at question-save time in the Zod/server logic, don't assume the UI alone prevents it.
- A question with missing text or a required option can be saved as a draft but **cannot** be published. Enforce this as two different validation levels (a lenient "draft" schema and a strict "publish" schema), not one schema with a boolean bypass flag.
- Teachers publish quizzes and topics directly — no approval queue. Don't add a `pending_approval` status "for safety" unless a future task explicitly asks for it.
- Content uploads (`content_items`) are Admin-only. Don't expose a Teacher-facing upload UI even as a hidden/disabled stub — it doesn't exist for this role at all.
- Active semester resolution always goes through the single `getActiveSemester()` resolver in `lib/semester/`. Never call `new Date()` and compare it against semester dates inline anywhere else in the codebase.

## 4. Code conventions

- TypeScript strict mode is on. Don't add `// @ts-ignore` to make a type error disappear — fix the type, or if it's genuinely unfixable, `// @ts-expect-error` with a one-line comment explaining why.
- File and folder naming inside `src/app/` follows Next.js App Router conventions exactly (`page.tsx`, `route.ts`, `layout.tsx`, route groups in parens). Don't invent a parallel routing convention.
- Server-only code (DB access, JWT signing, Supabase service-role calls) never gets imported into a file that also ships to the client. If a page needs server data, fetch it in a Server Component or a route handler, not by importing `lib/db` into a `"use client"` file.
- Every new resource (a table, roughly) gets: a Drizzle schema entry, a Zod validation schema, an API route handler (or handlers) using it, and a Vitest unit test for any non-trivial logic (grading, scoring, semester resolution, identifier validation) — not for simple CRUD passthroughs.
- Commit messages: `<phase-id>: <short description>` — e.g. `P3: add question bank CRUD API routes`. Phase IDs come from `PLAN.md`.

## 5. Testing

- `pnpm test` must pass before a task's `STATE.md` box gets checked. `pnpm lint` and `pnpm typecheck` too.
- Unit test the things that have real logic and real ways to be subtly wrong: quiz grading (both question types, multi-blank questions), CGPA/Post-UTME calculation, identifier regex validation, semester resolution (including the gap-fallback behavior in `DESIGN.md` §8), score-release visibility (held vs released).
- **Every API route gets a colocated endpoint test** (`route.test.ts` next to `route.ts`). Invoke the exported handlers directly (no HTTP server), mock auth at `@/lib/auth/guard` and the DB at `@/lib/db`, and use the shared helpers in `src/lib/testing/route-test.ts` (`makeDbMock`, `stubSelect`, `stubInsert`, `stubUpdate`, `stubDelete`, `jsonRequest`). Required coverage: 401 (`UnauthorizedError`), 403 (`ForbiddenError`), happy paths for each method, Zod failure → 422 with `error.details`, uniqueness conflicts → 409, and DELETE reference-blocks → 409 asserting the human-readable message names what blocks it. Exemplar: `src/app/api/admin/structure/levels/route.test.ts`. (This supersedes "don't write tests for simple CRUD passthroughs" from §4 — CRUD routes still need their auth/validation/conflict behavior tested even when they contain no business logic.)
- Don't write tests for shadcn/ui primitives — that's busywork, not coverage that catches real bugs.
- No e2e tests for MVP (decided, not an oversight) — don't add Playwright/Cypress even if it seems like the "more thorough" choice.

## 6. When you're unsure

If a task in `PLAN.md` is ambiguous, or you find a decision `DESIGN.md` doesn't actually cover (the way "who sets the active semester" wasn't in the original docs until it was explicitly asked about), do not guess and quietly ship an assumption. Either:
- Check if a later, more specific section of `DESIGN.md` resolves it (search before assuming it's genuinely open), or
- Leave it flagged clearly — a `// TODO(needs-board-decision): ...` comment plus a note added to `STATE.md` under the relevant task — rather than picking an answer and moving on as if it were settled.

The Post-UTME conversion formula (`DESIGN.md` §5) is a live example of this: it's implemented, but flagged as unconfirmed. Follow that pattern for anything else you hit that's genuinely undecided.

## 7. Page/screen specs

`.agents/design/` has one wireframe + layout + page spec per screen, grouped by role (`screens-auth.md`, `screens-admin.md`, `screens-teacher.md`, `screens-student.md`, `screens-aspirant.md`), indexed in `.agents/design/README.md`. Before building any page (`page.tsx` under `src/app/`), read that screen's entry — it has the layout, the exact API calls it needs, and every state (loading/empty/error/role-specific) the screen must handle. `DOS-Site-Wireframes.html` in the same directory is the original low-fidelity sketch these were derived from — it's a reference for visual intent, not the authoritative spec; `.agents/design/` is.

Every spec entry lists its `PLAN.md` Task ID — cross-check `STATE.md` before starting so you're building the right screen at the right point in the build order, not jumping ahead because a later screen's spec looked interesting.

If a screen's spec is silent on something with a real business-logic consequence (what happens to a held score, how a conditional field behaves), check `DESIGN.md` before improvising — don't invent behavior. If it's genuinely not covered anywhere, flag it per §6 below rather than guessing.

## 8. Database MCP access — if you have direct DB tools available

If a Supabase MCP server is connected in this session, treat it as **admin-level, RLS-bypassing access** — the service role key behind it isn't scoped down. The following are hard rules, not defaults you can override because a task seems easier that way:

- **Never connect to the production project.** If you don't know whether the connected project is dev or prod, stop and ask — don't infer it from the project name looking plausible. Only `dos-site-dev` (or equivalent, explicitly synthetic-data project) is ever a valid MCP target.
- **Treat the connection as read-only unless a task explicitly requires a write**, and even then: only to apply a migration that already exists as a file under `drizzle/` (generated from `schema.ts` per §2 above). Never use the MCP query tool to hand-type `ALTER TABLE`, `DROP`, `TRUNCATE`, or bulk `DELETE`/`UPDATE` without a `WHERE` clause — full stop, no exceptions for "just this once" during debugging.
- **Any schema change made via MCP must be reflected back into `lib/db/schema.ts` and committed as a proper migration.** A schema that only exists because an agent ran SQL through a chat tool, with no corresponding file in the repo, is a schema the next agent (or the next you) can't see and will silently break.
- **Never write, log, or echo the service-role key or any MCP auth token** in code, comments, commit messages, or conversation — including partially, for debugging. If a query result would expose it, don't run that query.
- **Don't run data-exploration queries against real user data** even in dev — the dev project should only ever contain seeded/synthetic rows (per §2's seed script scope, deliberately not real Faculties/Departments/Courses). If you find real-looking user data in a "dev" project, stop and flag it — it means the safety boundary already broke before you got here.
- Setup and config live in `.mcp.json` at the repo root — see `README.md` §"Connecting an agent to the DB" for the exact shape. Don't add a second MCP DB connection or point an existing one at a different project ref without this being an explicit, visible change to that file (i.e., something a human reviewing the diff would actually see).
