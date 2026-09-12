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
| `pnpm db:seed` | Run seed script (roles + bootstrap Admin) |

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
