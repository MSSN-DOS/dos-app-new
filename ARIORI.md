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
- `pnpm lint`, `pnpm typecheck` and the full `pnpm test` suite **were not run** — the sandbox's
  command classifier was unavailable for the whole session, so only that one command got
  through. Nothing is claimed about them either way. `STATE.md`'s P3-7 box is therefore left
  **unticked** on purpose: the code is written and its tests pass, but the gate this repo
  requires before ticking has not been met. Run all three and tick it.
- Not yet exercised in a browser against the dev DB — no attempt data was seeded for a teacher
  account, so the live path (real tallies, real held/released split) is unverified.

### Still open

- **Published quizzes cannot be edited by anyone, admin included** (`/api/teacher/quizzes/[id]`
  answers 409). Related to the Quiz Management feedback but a separate decision — the Board needs
  to say whether an admin may edit a quiz while students are mid-attempt.
- Teacher results have no admin-shell twin yet. The API is already admin-capable.
