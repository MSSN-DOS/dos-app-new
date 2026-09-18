# ARIORI.md

Solution log. One entry per piece of Board feedback, recording what was decided and what
changed. Newest entry last.

---

## 1. Staff Section — clicking the lower nav options errored out

**Reported:** "Clicking the lower section options yields errors like 'retry' or 'go back home',
so those functionalities are not working properly yet."

### What was actually wrong

"Staff" is the Teacher portal. The teacher nav (`src/components/shell/role-nav.ts`) advertised
five destinations — Dashboard, Topics, Questions, Quizzes, **Results** — and the last one,
`Results`, pointed at `/teacher/results`, **a page that did not exist**. No route, no API, no
screen. Every teacher who tapped it — it is the rightmost item in the phone bottom bar and the
last entry in the desktop sidebar — landed on the 404 shell.

The page was specified (`.agents/design/screens-teacher.md`) but never built: `/teacher/results/[quizId]`
plus `GET /api/teacher/results/[quizId]`. So the honest fix was to build it, not to hide the link.

### Decision taken (held scores)

The spec's wireframe showed a held attempt's score next to a "Held" pill. `DESIGN.md` §4 says the
opposite: a raw score must not reach a non-admin client while it is held. Resolved in favour of
`DESIGN.md` — a held-release rule that leaks to teachers is not a rule.

**A Teacher sees that an attempt is pending release; never its score.**

### What was built

**API**

| Route | Purpose |
|---|---|
| `GET /api/teacher/results` | The caller's quizzes that have ≥1 submitted attempt, with released/held tallies. Quizzes with no attempts are omitted — this is a results screen, not the quiz list. |
| `GET /api/teacher/results/[quizId]` | Per-quiz stats + one row per person who sat it. |

Guards are `requireAuth(request, ["admin", "teacher"])` and `ownershipScope()` — a teacher sees
only their own quizzes; an admin bypasses ownership, exactly like every other `/api/teacher/*`
route.

**The held-score rule is enforced in the query, not the UI.** The held-attempts select does not
project `score` at all, so an unreleased mark is never read out of the database. Because of that:

- `avgScore` and `passRate` are computed over **released attempts only**, and are `null`
  (rendered `—`) until something is released.
- A person whose only attempt is held appears as a row with `bestScore: null` and a `Held` pill.
- A person with both shows their best **released** score, plus a small `+N held` note.
- The stat row shows `Attempts` (a count, never a score) so a teacher can still see that
  responses exist while everything is pending.

**UI**

- `src/components/teaching/results-view.tsx` — the results index (shared component, `basePath`
  prop, matching `quizzes-view.tsx` so an admin-shell twin is additive later).
- `src/components/teaching/results-detail-view.tsx` — one quiz's results. Rendered as a list
  rather than a table: the spec's own wireframe is a `LIST ROW` format, and a 4-column table is
  the wrong shape on the phones this is mostly used on.
- Pages: `(teacher)/teacher/results/page.tsx` and `(teacher)/teacher/results/[quizId]/page.tsx`.

Every state is handled: loading skeleton, error + Retry, empty ("No attempts yet"), and the
held note. Interactive targets are ≥44px; the pill pair is not colour-only — each one carries
its own words.

### Deviation flagged

`screens-teacher.md` says a quiz owned by another teacher should answer **403**. This returns
**404 "Quiz not found"** instead, matching the existing convention in
`/api/teacher/quizzes/[id]` so the route does not confirm that another teacher's quiz exists.
Recorded in `STATE.md` rather than silently chosen.

### Files

**Added**

- `src/app/api/teacher/results/route.ts`
- `src/app/api/teacher/results/route.test.ts`
- `src/app/api/teacher/results/[quizId]/route.ts`
- `src/app/api/teacher/results/[quizId]/route.test.ts`
- `src/components/teaching/results-view.tsx`
- `src/components/teaching/results-detail-view.tsx`
- `src/app/(teacher)/teacher/results/page.tsx`
- `src/app/(teacher)/teacher/results/[quizId]/page.tsx`

**Changed**

- `STATE.md` — the task recorded under Phase 3 with its notes and the flagged deviation.

**Unchanged, deliberately:** the nav item itself. `Results` was correct all along; the page
behind it was missing. The onboarding tour line "The sidebar always lists Dashboard, Topics,
Questions, Quizzes and Results" also becomes true again rather than being deleted.

### Verification

- `pnpm vitest run src/app/api/teacher/results` — **14 tests, all passing.** Covers 401, 403, 400
  bad id, 404 missing quiz, 404 another teacher's quiz, admin access, held-score suppression
  (a held row is fed a score and asserted absent from the payload), null-average-before-release,
  and a null score not crashing the route.
- `pnpm lint`, `pnpm typecheck` and the full `pnpm test` suite: **now all green** — verified
  2026-09-17 (651/651 tests, 0 lint errors, clean typecheck). The box in `STATE.md` is ticked.
- Not yet exercised in a browser against the dev DB — no attempt data was seeded for a teacher
  account, so the live path (real tallies, real held/released split) is unverified.

### Still open

- **Published quizzes cannot be edited by anyone, admin included** (`/api/teacher/quizzes/[id]`
  answers 409). Related to the Quiz Management feedback but a separate decision — the Board needs
  to say whether an admin may edit a quiz while students are mid-attempt.
- Teacher results have no admin-shell twin yet. The API is already admin-capable.

---

## 2. Resource Links — video links submitted from Google Drive

**Reported:** "Along with PDFs and articles, we need to add video links. We currently post
videos to a Telegram group serving both JAMB and 100-level students, making it hard to
organize. If students log into the portal, they should see organized links directing them to
the specific Telegram videos."

Hosting was later clarified: **the links come from Google Drive, submitted by Teachers.**

### The rule this collided with

`AGENTS.md` §3 said `content_items` is **Admin-only** — *"Don't expose a Teacher-facing upload
UI even as a hidden/disabled stub."* `DESIGN.md` recorded it as a closed Board decision from
the alignment interview. So a Teacher-facing submission screen is a direct reversal of a
decision — which `AGENTS.md` says must be raised, not quietly built.

### Decision: a link is not an upload

The rule governs **uploads** — files that land in Supabase Storage under
`resources/{faculty}/…`. A Drive link is a URL: no file, no Storage object, no path. Read
narrowly, letting Teachers submit *links* honours the decision as written rather than
overturning it, and `pdf`/`article` uploads stay Admin-only.

Both documents were **amended with that reasoning** (rather than silently deviated from):
`AGENTS.md` §3 and `DESIGN.md` §6 + decision table row 4 now carry the carve-out and its
limits, so the next person reading the rules sees the reasoning, not just a contradiction.

### Decisions taken

| Question | Answer |
|---|---|
| Who can add a link | Teachers **and** admin. Teacher endpoints hard-code `type: 'video'`, so `pdf`/`article` stay unreachable for that role — enforced by a test, not by convention. |
| Go live immediately? | **Yes, no approval queue** — consistent with `AGENTS.md` §3's "Teachers publish quizzes and topics directly". Admin can delete a bad link. |
| How students watch | **Embedded inline** (normalised player) **plus** an "Open in Drive" link. |
| Semester | **Videos never expire.** A recorded lecture stays reachable after the rollover; PDFs and articles still expire as before. |

### What was built

**A pure parser, `lib/content/video-link.ts`** — the piece with real logic, so the piece with
real tests (23). It exists because of one specific trap:

> **Google refuses to frame Drive `/view` links.** If you embed the URL a teacher actually
> copies out of Drive, you get a **blank box that looks like it loaded**. Only `/preview`
> embeds. So the parser rewrites `/view` → `/preview`, and the teacher never has to know.

It also normalises `/open?id=`, `drive.usercontent.google.com`, YouTube
(watch / youtu.be / shorts / embed) and Telegram; returns `embedUrl: null` for Drive folders
and Telegram posts (nothing to frame) and falls back to a plain link. It **rejects
non-http(s) schemes**, so a `javascript:` or `data:` URL can never be stored and rendered as
an href.

The **pasted URL is stored exactly as given** and parsed at read time — so improving the
parser later improves every existing link, not just new ones.

**API**

| Route | Purpose |
|---|---|
| `POST/GET /api/teacher/resources` | Submit and list your links. Teacher sees only their own (`uploadedBy`); admin bypasses. |
| `PATCH/DELETE /api/teacher/resources/[id]` | Fix a title or URL; remove a link. |
| `POST /api/admin/content` | Gained a third track so admin can post links too. |
| `GET /api/resources` | Video rows return `provider` / `watchUrl` / `embedUrl`. |

Editing is title + URL only. Re-scoping would need the course-XOR-subject rule re-checked
against a partial update; delete and re-add is clearer than a half-updated scope.

**UI**

- `/teacher/resources` — new screen + a "Videos" nav item. Carries the warning that will
  prevent most support tickets: *set the Drive file to "Anyone with the link"*.
- `/admin/content` — a third tab, "Video link".
- `/resources` — provider badge, inline player, and a Watch link. **The player iframe mounts
  only when tapped** — one iframe per row would burn mobile data on page load for an audience
  that is mostly on phones.

### Two things the Board should know

1. **Drive is not a CDN.** Google rate-limits and quota-caps hotlinked video. For a two-cohort
   audience this is a stopgap, not a foundation — if video becomes central to study, budget
   real hosting or a YouTube channel before students depend on it.
2. The teacher nav now has **six** items in the phone bottom bar, past the usual five-item
   ceiling for thumb reach. Worth moving one behind the dashboard or a "More" sheet.

### Verification

- **Migration applied and verified.** `drizzle/0006_chemical_captain_midlands.sql` was generated
  with `pnpm db:generate` and applied with `pnpm db:migrate`; `content_type` was read back from
  `pg_enum` as `pdf, article, video`. The feature is live, not inert.
- `pnpm vitest run src/app/api/resources src/lib/content src/app/api/teacher/resources` —
  **58 tests, all passing** across 4 files. Covers the URL parser (including a `javascript:`
  rejection), both teacher endpoints (401/403/404/422/ownership/admin), and that a video row is
  normalised rather than being handed back as an article body.
- Full suite: **651 tests across 57 files, all passing** — nothing existing broke.
- `pnpm typecheck` clean; `pnpm lint` **0 errors** (one pre-existing warning in
  `src/lib/auth/client-fetch.ts`, a file this work never touched).

### Still open

- **The semester exemption is not unit-tested.** It is a SQL-level condition, and the shared
  route-test stub ignores `where()` arguments — a test would pass vacuously and prove nothing.
  It needs a live check: submit a video in Harmattan, flip the semester to Rain, confirm the
  video persists and a PDF does not.
