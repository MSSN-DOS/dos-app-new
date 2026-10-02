# DOS Site

Free e-learning and quiz platform for MSSN Unilorin's Board of Studies — serves enrolled Students (undergraduates) and Aspirants (JAMB candidates). No payment/subscription flow anywhere.

This repo is built primarily by AI coding agents. **If you are an AI agent, read [`AGENTS.md`](./AGENTS.md) in full before writing any code.** It is not optional context — it is the rulebook.

## Document map

| File | Purpose |
|---|---|
| `README.md` | This file — setup, scripts, folder structure |
| `DESIGN.md` | Product logic, data model, route map, UI/design tokens, business rules |
| `AGENTS.md` | Hard rules for any model/agent working in this codebase |
| `PLAN.md` | Phased build order, in dependency order |
| `STATE.md` | Checkbox tracker — one row per `PLAN.md` task, kept in sync as work lands |

Read them in that order once, then treat `STATE.md` as the single source of truth for "what's done" and `PLAN.md` for "what's next."

## Tech stack

| Layer | Choice |
|---|---|
| Package manager | pnpm |
| Framework | Next.js (App Router), single app — UI pages + `/api` route handlers together |
| Language | TypeScript, strict mode |
| Database | Supabase Postgres |
| ORM | Drizzle ORM |
| File storage | Supabase Storage |
| Styling | Tailwind CSS + shadcn/ui (mobile-first) |
| Validation | Zod (forms and API payloads, one schema reused both places where possible) |
| Client server-state | TanStack Query (`useQuery`/`useMutation` over the shared `apiFetch` wrapper — no manual fetch loops) |
| Auth | Custom JWT, `Authorization` header, stored client-side in `localStorage`, 7-day expiry, no refresh token — see `DESIGN.md` §Auth for the accepted trade-off |
| Testing | Vitest (unit/logic only for MVP, no e2e yet) |
| CI | GitHub Actions — lint, typecheck, test on every PR |
| Hosting | Vercel |

No Supabase Auth, no Firebase, no Prisma, no npm/yarn. See `AGENTS.md` for why these are hard "don'ts," not preferences.

## UI conventions

- **Mobile-first.** Build narrow-viewport-first, enhance upward. Tailwind classes are written `base` → `sm` → `md` → `lg`, never desktop-default `md:*` that breaks below it.
- **shadcn/ui is the only component kit.** Install new primitives via `pnpm dlx shadcn@latest add <component>`; hand-roll only when no shadcn equivalent exists. Icons come from `lucide-react` — one library, never hand-rolled SVG or emoji.
- **Tokens only.** Every color resolves to a `DESIGN.md` §12 CSS variable; no raw hex/hsl in components.
- **TanStack Query for server state.** Client components fetch via `useQuery`/`useMutation` (provider in `components/providers/query-provider.tsx`); `apiFetch` is the transport inside `queryFn`/`mutationFn`, never called with inline `useEffect`+`useState` loops.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in the values below
pnpm db:generate              # generate Drizzle migration from schema
pnpm db:migrate                # apply migrations to your Supabase Postgres instance
pnpm db:seed                   # seeds roles table + one bootstrap Admin account
pnpm dev
```

### Required environment variables (`.env.local`)

```
DATABASE_URL=                 # Supabase Postgres connection string (pooled, for app runtime)
DIRECT_URL=                   # Supabase Postgres direct connection (for migrations)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=    # server-side only, used for Storage uploads — never exposed to client
JWT_SECRET=                   # 32+ char random string, used to sign/verify auth JWTs
BOOTSTRAP_ADMIN_IDENTIFIER=   # staff_id for the first seeded Admin account
BOOTSTRAP_ADMIN_PASSWORD=     # plaintext, only read once by the seed script, then hashed
```

Never commit `.env.local`. `.env.example` should exist in the repo with the keys above and empty/placeholder values only.

## Connecting an agent to the DB (optional, dev-only)

If you want Claude Code or another MCP-capable agent to query/inspect the database directly (schema-aware code, faster debugging), use the official Supabase MCP server — **against a separate dev project only, never production.** Full rules for what an agent is and isn't allowed to do with this access are in `AGENTS.md` §7 — read that before enabling it, not after.

Create `.mcp.json` at the repo root:

```json
{
  "mcpServers": {
    "supabase-dev": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=YOUR_DEV_PROJECT_REF&read_only=true&features=database,docs",
      "headers": { "Authorization": "Bearer ${env:SUPABASE_MCP_TOKEN}" }
    }
  }
}
```

- `read_only=true` — default posture. Writes are rejected server-side, not just discouraged.
- `features=database,docs` — excludes `account`, `branching`, `storage` tool groups on purpose.
- `SUPABASE_MCP_TOKEN` goes in your shell/CI secrets, never committed. `.mcp.json` itself is safe to commit — it holds no literal secret.
- To apply a migration, either temporarily flip `read_only=true` → `false` for that session, or add a second `supabase-dev-write` entry you reference explicitly by name. Never make write-mode the default.
- The dev project should contain only seeded/synthetic data — never a copy of real production user records.

## Scripts

| Command | Does |
|---|---|
| `pnpm dev` | Local dev server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest, single run |
| `pnpm test:watch` | Vitest, watch mode |
| `pnpm db:generate` | Generate a Drizzle migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:mark-applied` | Record a migration you applied by hand (see below) |
| `pnpm db:seed` | Run seed script (roles + bootstrap Admin) |
| `pnpm db:flush:dev` | Delete all data rows, leaving schema intact. **Dev only** |
| `pnpm db:verify:video` | Assert the video semester-exemption still holds. **Dev only** |
| `pnpm guard` | Supply-chain scan over the tree |

### Writing scripts is gated on the project ref, not the hostname

`db:flush:dev` and `db:verify:video` both write real rows. They refuse unless the target database
is a **local** host or a Supabase **project ref** listed in `DOS_DEV_PROJECT_REFS`
(`.env.local`).

The guard keys on the project ref rather than the hostname because the hostname cannot
discriminate: Supabase routes every project through shared pooler hosts
(`aws-1-<region>.pooler.supabase.com`) and shared `<ref>.supabase.co` API hosts, so a dev project
and its production counterpart have the *same* host. Only the 20-character project ref — which
appears in the connection username as `postgres.<ref>` — tells them apart.

Do not add a hostname check to work around this; it will either reject the real dev database or
pass both. Add your dev ref to `DOS_DEV_PROJECT_REFS` instead.

## Deploying a migration

**Migrate first, deploy second.** The app's code queries columns that only exist once the
migration has run, so deploying ahead of migrating serves 500s on the first request that touches
them. `drizzle/__drizzle_migrations` is the journal both steps read, so the safe order is:

```bash
pnpm db:migrate    # 1. apply pending migrations to the target database
pnpm build          # 2. build, then deploy
```

Do not add `db:migrate` to the deploy command itself. It runs migrations as a side effect of
shipping code, which means a failed migration leaves you with new code against an old schema — the
same 500s, now harder to roll back.

### If you applied a migration by hand

Some migrations here mix DDL with data backfills and cannot be run by
`drizzle-kit migrate` at all — `0008_material_thor.sql` rewrites `courses.session_id` from a join,
which the migrator cannot express. When you apply one directly in the Supabase SQL editor, the
journal does not know, and the next `pnpm db:migrate` tries to run it again and dies on
`relation "academic_sessions" already exists` — wedging *every* migration queued behind it,
because drizzle applies the pending batch in a single transaction.

Record it so the journal matches reality:

```bash
pnpm db:mark-applied 0008_material_thor
```

The command shows the migration's SQL and its sha256 and asks for confirmation. It refuses on a
tag that does not exist, on a file whose contents changed since it ran, and on a migration older
than one already recorded. It does **not** check that you actually applied the migration — that is
not verifiable in general, since a migration that only backfills data leaves no end state to
inspect. Read the SQL it prints before you confirm.

If the journal is already wedged by an earlier partial attempt, clear the stale rows out of
`drizzle.__drizzle_migrations` before re-running.

## Folder structure

```
src/
  app/
    (auth)/              # login, register, onboarding — public routes
    (admin)/admin/        # Admin-only pages, guarded by middleware
    (teacher)/teacher/     # Teacher-only pages
    (student)/             # Student-only pages
    (aspirant)/             # Aspirant-only pages
    api/                     # route handlers, mirrors the page structure above
  components/
    ui/                      # shadcn/ui primitives, unmodified except theme tokens
    shared/                  # cross-role components (quiz-taker, question-editor, etc.)
  lib/
    db/                      # Drizzle schema + client + queries
    auth/                    # JWT sign/verify, session helpers, role-guard middleware
    validation/              # Zod schemas, one per resource
    scoring/                 # CGPA + Post-UTME calculators, quiz auto-grading
    semester/                # active-semester resolver (calendar + admin override)
  styles/                    # Tailwind config, theme tokens
drizzle/                    # generated migrations — never hand-edit
tests/                       # mirrors src/ structure
.github/workflows/ci.yml
```

Full route map and API surface are in `DESIGN.md`.

## Source documents

This repo implements the requirements, proposal, database schema, and wireframes originally reviewed by the Board's IT team on 2026-08-19, plus a follow-up alignment interview on 2026-08-22 that resolved every open question from that review (see `DESIGN.md` §Resolved Decisions for the full list). Those original documents are not duplicated here — `DESIGN.md` is now the living source of truth.
