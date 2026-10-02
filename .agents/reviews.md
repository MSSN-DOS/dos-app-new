# DOS Site — Code Review & Security Audit Record

Every finding from a four-layer review of the three unpushed commits on `main`, run 2026-10-01. Base ref `origin/main` (`375a9f5`, also the merge-base) → HEAD `62d8a74`. Worktree was clean throughout; the review changed no code.

This file is the durable record. If a finding here ever disagrees with a code comment, the comment is wrong and this file plus the vendored evidence below are why.

Findings are filed as originally written and have **not** been edited to match their own fixes — a
review record that does that stops being evidence. What was done about them is in the
[Remediation log](#remediation-log) immediately below the verdict. One finding (S-3) is corrected
in place, because the triage itself was wrong.

## Commits under review

| Commit | Subject | Size |
|---|---|---|
| `62d8a74` | P2, P6: lock the staff-ID format, verify the video semester exemption live | 9 files, +382/−10 |
| `09ae830` | P7-5: put the session year in the data model, one row per course offering | 43 files, +5065/−249 |
| `1bc0aca` | P3, P7, P8: board decisions on quiz locking, admin results, and the semester | 13 files |

## Verdict

**Security: one real bug, found in the layer nobody was looking at.** No auth bypass, no PII
disclosure, no privilege escalation — every genuinely dangerous surface this diff touched is
correctly implemented (RLS on the new table, held-score visibility, the teacher video-only carve-out,
JWT algorithm pinning). But S-3's triage dismissed all five `fallow` candidates, and one of them was a
stored XSS reachable by any teacher. The lesson is that "triaged, none confirmed" is not the same
claim as "none found", and only one of those five was verified by reading what the code actually did
rather than what it was supposed to do.

**Correctness: two real bugs and one structural rot.** Both bugs are reachable and both are
contradicted by a comment or a Board decision that says the opposite.

| Severity | Count | IDs |
|---|---|---|
| High | 1 | R-1 (Board decision vs. code) |
| Medium | 5 | R-2, R-3, S-1, R-4, R-5 |
| Low | 6 | R-6 … R-10, S-2, S-3 |
| Debt | 3 | D-1 (32× duplicate), D-2 (dead types), D-3 (tests that assert nothing) |

S-3 is filed Low because that is how it was triaged. On verification it is a **stored XSS and should
be read as High** — see its section. The count is otherwise unchanged.

Gate state at `62d8a74`, for reference: 774 tests / 63 files pass, typecheck clean, lint 0 errors + 1 pre-existing warning (`src/lib/auth/client-fetch.ts:23:5`).

## Remediation log

The findings below are filed as written at `62d8a74` and left untouched, because a review record that
gets edited to match its own fixes stops being evidence. What follows is what was actually done
about them, and where. Every fix below is either mutation-verified (revert the change, watch the
test fail) or live-verified against the dev database.

| ID | Status | What changed |
|---|---|---|
| R-1 | Fixed | Option (a): honour the decision. `finalizeUnsubmittedAttempt` extracted to `src/lib/quizzes/finalize-attempt.ts`; unpublish finalises open attempts in one transaction, before the status flips. |
| R-2 | Fixed | `activeCourseFilter` returns `sql\`false\``, not `undefined`. Both backwards comments rewritten. |
| R-3 | Fixed | PATCH gained the same 409 identity guard POST already had. |
| R-4 | Fixed (partly) | The banner the finding prescribed. `newestSessionEndInPast()` reports an expired calendar; `session-manager.tsx` renders it. **The dates themselves remain Board data entry.** |
| R-5 | Fixed | `src/scripts/mark-migration-applied.ts` (`pnpm db:mark-applied`); deploy ordering documented in `README.md`. |
| R-6 | Fixed | Two vacuous assertions replaced with three tests that assert on rendered SQL. |
| R-7 | Fixed | `atUtc()` helper plus four boundary tests. First attempt was wrong and was caught — see below. |
| R-8 | Fixed | Verify script 8 → 18 assertions; the session axis is now covered and mutation-proven. |
| R-9 | Fixed | Comment split into two accurate ones. |
| R-10 | Fixed | Badge now checks semester as well as session. Root cause was an AGENTS.md §3 violation, fixed at the source. |
| R-11 | Fixed | Sort keys on the session label; `sessionId` only breaks ties. |
| S-1 | Fixed | `eq(quizzes.quizType, "course")` added explicitly. |
| S-2 | Fixed | `src/scripts/assert-dev-environment.ts` gates on the Supabase **project ref**. The suggested hostname fix does not work — see below. |
| S-3 | **One of five was real** | Stored XSS in question body text. Fixed at all three write paths. The other four were false positives. |
| D-1 | Fixed | `errorResponse()` learned `ZodError`; 33 duplicated handlers deleted. |
| D-2 | Fixed | `src/lib/types.ts` deleted (204 lines, imported by nothing, and describing a schema that does not exist). |
| D-3 | Fixed | Covered by R-6 and R-7. |
| D-4 | Fixed | Rules extracted to `src/lib/quizzes/builder-validation.ts` (20 tests); attach section to `quiz-attach-section.tsx` (14 tests). 624 → 459 lines. |

**Three findings were wrong, or wrong in their proposed fix.** That is worth recording, because
the review's evidence sections are treated as authoritative elsewhere in this file:

- **S-2 proposed a hostname check.** That cannot work. Supabase routes every project through shared
  pooler hosts (`aws-1-eu-west-1.pooler.supabase.com`) and shared `<ref>.supabase.co` API hosts —
  this repo's *dev* database and its production database share a hostname. The only discriminator
  is the 20-character project ref in the connection username. `README.md` now says so explicitly,
  so the next person does not try it.
- **R-4's "add a warning banner" was not the finding.** The finding was that 2025/26's `rain_end`
  is 2026-07-03 and there is no 2026/27 row, so the calendar is stale forever. A banner does not fix
  that; dates do. The banner was built anyway — it is what the finding prescribed, and it converts
  a silent stale state into a visible one — but the 2026/27 dates are still outstanding Board data
  entry, and the banner says so in its own copy.
- **R-7's first test was my error, not the code's.** My initial year-boundary test used a session
  where both candidate instants resolved to the same semester, so it could not fail. Replaced with
  a synthetic session whose `rainStart` is 1 January, so the rollover must carry the year.

Gate state after remediation: **875 tests / 68 files pass**, typecheck clean, lint 0 errors + the
same 1 pre-existing warning, guard clean. (`@testing-library/user-event` added as a devDependency
for the D-4 component tests; the first component tests in the repo.)

### What is still outstanding after all of this

Only Board-owned items remain, neither of which is an engineering task:

- **2026/27 session dates.** 2025/26 ends 2026-07-03. Until an Admin enters the next session, the
  portal keeps serving 2025/26 and the new banner warns about it.
- **R-1's alternative reading.** Option (a) was chosen because it implements the decision
  `STATE.md:114` already records; option (b) — retracting that decision — would have needed the
  Board again. If the Board would rather lose the attempt than score it 0, that is one small change
  away, and it should be a recorded decision rather than a silent one.

---

# Part 1 — Findings

## R-1 · HIGH · Unpublish voids in-flight attempts; the UI promises the opposite

**Where.** `src/components/teaching/quiz-builder-view.tsx:587` (dialog copy) · `STATE.md:114` (Board decision) · `src/app/api/quizzes/[id]/attempt/route.ts:183` (GET gate), `:422` (POST gate), `:234` (`autoSubmitStaleAttempt`) · `src/app/api/teacher/quizzes/[id]/unpublish/route.ts`

**What.** `STATE.md:114` records a **Board decision dated 2026-09-30** whose last sentence reads, verbatim:

> In-flight attempts are unaffected by an unpublish (they keep counting); only new starts are blocked.

The unpublish dialog at `quiz-builder-view.tsx:587` tells the user the same thing. **Neither is true.** The decision is not merely unimplemented — it is implemented in the exact opposite direction, and the code contradicts the recorded Board intent on both counts: in-flight attempts are not unaffected, *and* they are not the only thing blocked.

`attempt/route.ts:183` (GET) and `:422` (POST) both hard-gate on `status !== "published"` and return 404. `autoSubmitStaleAttempt` is invoked at `:234` — **after** the `:183` gate. So once a quiz leaves `published`, a stranded open attempt can never be rescued: the client cannot fetch it, cannot POST to it, and cannot reach the auto-submit path.

There is no answer-autosave endpoint. Answers exist only in the browser until POST, so there is nothing server-side to recover even in principle.

The unpublish route itself never touches open attempts. It queries `quizAttempts` **only** to count rows with `releasedAt IS NOT NULL` — i.e. released attempts, not in-flight ones.

**Blast radius.** Bounded, and worth stating precisely so it isn't over-escalated: one lost attempt. No phantom score (nothing is graded, so nothing enters CGPA). No lockout — the "already attempted" guard counts only *submitted* attempts, so the student can retake.

**Why it still matters.** It is silent, and it fires exactly when an Admin unpublishes a quiz to fix a bad question — the moment a student is most likely to be mid-attempt.

**Fix.** Two opposite options; this is a **Board decision, not an engineering call**:

- **(a) Honour the decision.** Auto-submit open attempts inside the unpublish transaction, before the status flips.
- **(b) Retract the decision.** Remove the claim from the dialog and from `STATE.md:114`, and accept the loss explicitly.

Whichever the Board picks, the other artefact must change with it. Leaving both is what produced this finding.

## R-2 · MEDIUM · The semester filter fails OPEN, and both comments assert it fails closed

**Where.** `src/lib/semester/index.ts:90-92` (doc comment), `:95-102` (the function) · `src/app/api/quizzes/route.ts:125-126` (comment at the call site) · `src/app/api/resources/route.ts:148-155` (the `or()` variant)

**What.** `activeCourseFilter()` returns `undefined` when no session resolves. The stated intent is that a caller passing it into `and(...)` matches **nothing** — a deliberate fail-closed design, so that "with no calendar entered, the portal must show no semester-scoped content rather than the wrong session's."

Drizzle does the opposite. Verified by reading the vendored source, not by inference:

```js
// node_modules/drizzle-orm/sql/expressions/conditions.js:26
function and(...unfilteredConditions) {
  const conditions = unfilteredConditions.filter((c) => c !== void 0);
```

`and()` **removes** undefined predicates. So `and(eq(quizzes.status,'published'), undefined, eq(courses.levelId, X))` emits a query with **no semester filter and no session filter at all**.

Both comments state the inverse of the behaviour. A reviewer who trusts them signs off on the opposite of the truth — which is why this finding is ranked above its raw severity.

**Net effect.** With an empty calendar, `GET /api/quizzes` returns every published quiz at the student's level, across every session and both semesters.

**Reachability.** Only when `academic_sessions` is empty. In every other case the gap-fallback resolves to the newest session and the filter is well-formed. An Admin *can* construct the precondition: the session DELETE guard only blocks sessions that have courses, so deleting every session is permitted once no course references one.

**The `or()` case.** `resources/route.ts:153` reaches its documented outcome — videos visible, PDFs hidden — but **by accident**. Dropping the filter leaves `type = 'video'`, which happens to exclude PDFs. The reasoning in the comment is wrong even though the result is right, which is the worst combination: it will not warn anyone when the inputs change.

**Impact class.** Content over-exposure, not PII. Fails toward showing more than intended.

**Fix.** Return `sql\`false\`` instead of `undefined` from `activeCourseFilter`, so the predicate is present and false rather than absent. Alternatively short-circuit the request on `!resolved.ok`. Then **rewrite both comments** — they are the defect as much as the code is, because they are what a future reviewer will trust.

## R-3 · MEDIUM · Course identity is unenforced on PATCH (found independently by two layers)

**Where.** `src/app/api/admin/structure/courses/route.ts:138` (POST, has the guard) · `src/app/api/admin/structure/courses/[id]/route.ts:68` (PATCH, writes `sessionId` with no guard) · `src/app/(admin)/admin/structure/courses/page.tsx:282` (client sends `sessionId` in the PATCH body; the PATCH call is at `:179`) · `src/lib/db/schema/courses.ts:20-26`, `:30-31` (documents the invariant)

**What.** POST returns 409 *"already exists at this level for this semester in this session."* PATCH writes `sessionId` with no equivalent check — its three 409 paths are all DELETE reference-blocks (*"cannot be deleted"*).

Meanwhile `courses.ts:30-31` documents the uniqueness constraint as a property of the table, and `structure.ts:46-49` says the session is part of identity and *"not an attribute to be edited in place."* Then the UI sends it anyway.

**Pre-existing, widened by this diff.** The gap already existed for `code`, `level`, and `semester`. P7-5 added `sessionId` to the editable set, so the diff **widened the hole** — moving a course between sessions now manufactures exactly the duplicate that POST refuses to create.

`courseUpdateSchema` (`structure.ts:103`) is a bare alias of the create schema, so the create-time identity rule is nominally in scope for the update path and still not enforced.

**Impact.** Admin-only, so no privilege escalation. But it silently defeats a Board-recorded invariant and moves released, CGPA-affecting scores into the wrong year — the exact failure P7-5 existed to prevent.

**Fix.** Reject a `sessionId` (and `code`/`level`/`semester`) change in PATCH when it would collide with an existing course, or drop those fields from the update schema entirely and make session reassignment a distinct operation. Pick one and write the decision down.

## R-4 · MEDIUM · A stale calendar fails silently and forever

**Where.** `src/components/admin/session-manager.tsx:238`

**What.** 2025/26 `rain_end` is 2026-07-03. With no 2026/27 row, the resolver gap-fallback returns the newest session, so students keep receiving 2025/26 material indefinitely. Only `sessions.length === 0` is handled — a single stale row is invisible.

**Why it's medium and not low.** The failure is silent, unbounded in time, and produces a portal that looks healthy while serving the wrong year. The one open item on the Board (`2026/27 session dates`) is exactly this.

**Fix.** Warn on the settings page when the newest session's `rain_end` is in the past — a banner, not an error. The system cannot invent the dates, but it can refuse to be quietly wrong about them.

## R-5 · MEDIUM · Deploy-before-migrate produces 500s, and a hand-applied migration wedges the migrator

**Where.** `drizzle/0008_material_thor.sql` · the pg migrator's applied-row comparison

**What.** Two separate problems.

1. `0008` is **not backwards-compatible** with code that predates it — `courses.session_id` is queried unconditionally. Deploy the app first and every course surface 500s. There is no migration-on-deploy step.
2. The pg migrator compares only against the **last applied row**. If `0008` is hand-applied via `psql` (which is easy to do here, since it is a documented data migration), `db:migrate` sees a journal that no longer chains and refuses to run — so the *next* migration is blocked too.

**Fix.** Document the migrate-then-deploy order in the runbook, and record any hand-applied migration in the journal so the migrator stays consistent.

## R-6 · LOW · `activeCourseFilter`'s test asserts that the filter exists, not that it filters

`expect(filter).toBeDefined()` — delete the `sessionId` predicate and CI stays green. This is precisely the failure mode `verify-video-exemption.ts` was written to escape. The critique was correct when applied to that script and was not applied to its sibling.

**Fix.** Assert on the emitted SQL, or on behaviour through a stubbed query that respects `where()`.

## R-7 · LOW-MED · The WAT offset has zero effective test coverage

Every test input is `T00:00:00Z`, so the `watDay` WAT offset never shifts a boundary. Deleting the offset entirely keeps CI green.

## R-8 · LOW-MED · `verify-video-exemption.ts` is not in CI or pre-push

It is a real gate that gates nothing automatically. It also never exercises the session axis, only semester and content type.

## R-9 · LOW · The comment on `containing` describes the fallback, not `containing`

`src/lib/semester/calendar.ts:99` builds `containing` with `started.find(...)`, which returns the **first** match. The comment at `:102-104` then describes it as *"the last session whose window has not closed."*

The logic is fine — the "last" in that comment actually describes the fallback on `:105`, `started[started.length - 1]`, which genuinely is the newest started session. But the comment is attached to the wrong variable, and the variable is named `containing` while the prose calls it "last". A reader trying to reason about overlapping session windows will draw the wrong conclusion about which one wins.

No behavioural bug. Documentation defect in code that a wrong assumption could turn into one.

## R-10 · LOW · "Active now" badges compute auto-resolution, so they are wrong under manual override

The badges always show the auto-computed semester. When an Admin has pinned a manual override, the badge contradicts the page it is on.

## R-11 · LOW · `sessionId` sort is accidentally chronological, and unvalidated

`b.sessionId - a.sessionId` assumes session IDs increase with time — true only because rows were inserted in order. `sessionId` is `z.coerce.number()` with no existence check, so a bad value yields an FK violation surfaced as an opaque 500 rather than a 422.

## S-1 · MEDIUM · `apply-release.ts` excludes topic quizzes for the wrong reason

`src/lib/scoring/apply-release.ts:64` selects best scores into CGPA by `row.courseId !== null` and `:67` selects into Post-UTME by `row.jambSubjectId !== null`. It never checks `quizType === 'course'`.

Topic quizzes are excluded **incidentally**, by `eq(quizzes.weekStart, weekStart)` at `:60` — topic quizzes have a NULL `weekStart`. The behaviour is correct today for a reason entirely unrelated to the rule the code appears to implement.

This matters because `AGENTS.md` §3 names Course-Quiz-only-for-CGPA as a non-negotiable. The rule is currently enforced by a coincidence, not by the check that expresses it.

**Fix.** Add a defensive `eq(quizzes.quizType, "course")`. One clause, and it makes the invariant readable instead of lucky.

## S-2 · LOW-MED · The video verification script's production guard is satisfiable by an unset variable

`src/scripts/verify-video-exemption.ts:51` refuses only when `NODE_ENV === "production"`. **`tsx` does not set `NODE_ENV`.** Point `DATABASE_URL` at production and the script proceeds to write: 4 `content_items` inserts at `:149-161` and a rewrite of the global `semester_settings` row at `:165-170`.

The script is otherwise well-behaved — `finally` cleanup, snapshot/restore of `semester_settings`, a real exit code, and the pool closed.

**Fix.** Refuse unless `DATABASE_URL` matches a dev/staging host. A hostname assertion is the one check an unset environment variable cannot defeat. `src/scripts/flush-dev.ts:25` has the identical limitation.

## S-3 · LOW · Five unverified static-analysis security candidates

Flagged by `fallow`, triaged by hand, **none confirmed**:

| Location | Signal | Read |
|---|---|---|
| `src/lib/storage/supabase-storage.ts:34` | high | User-supplied filename reaching storage — needs a real path check |
| `src/lib/auth/client-fetch.ts:95` | medium | PII-ish in a request |
| `src/components/teaching/questions-view.tsx:769` | `dangerous-html` | Renders question text; likely sanitised upstream |
| `src/app/(student-aspirant)/quizzes/[id]/attempt/page.tsx:286` | `dangerous-html` | Same, check for unescaped user content |
| `src/scripts/seed.ts:88` | `secret-pii-log` | Bootstrap identifier in a log line |

### Correction: one of these five is a real stored XSS

**The "none confirmed" triage above is wrong about `attempt/page.tsx:286`, and the severity label is
wrong too.** This was the find worth doing the rest of the list for.

`attempt/page.tsx:286` renders `question.bodyRichText` through `dangerouslySetInnerHTML`, under a
comment reading *"sanitize at author time; render innerHTML is safe here (sanitized on save)"*.
**Nothing sanitised on save.** `sanitizeRichText` was called in exactly one place — the client-side
rich-text editor, as a preview — and all three server write paths stored `data.bodyRichText`
verbatim. The comment described an invariant that did not exist.

The client call is not a guarantee. Any caller that does not go through that editor stores script
that executes in **every student's** browser on every attempt at that question: `curl`, a stale tab
predating the editor, a future importer, or a second API route added later. This was reachable by
any teacher — a role that is deliberately trusted with authoring content but not with running code
in other users' browsers.

Fixed at all three write boundaries (`questions/route.ts`, `questions/[id]/route.ts`,
`questions/bulk/route.ts`) rather than at the render site, because a write-side guarantee is the one
that cannot be bypassed by adding a fourth path later. Each carries a comment saying the client-side
call is a preview convenience, not the guarantee.

`src/lib/sanitize.ts` had **no test file at all**. It now has 8, written as bypass shapes rather than
restatements of the implementation, including an idempotence test — sanitising now runs on every
write, so non-idempotent stripping would quietly ratchet formatting away each time a teacher re-saved
a question. Route-level tests assert the *stored* value is sanitised across all three paths.

The other four are false positives, confirmed rather than assumed:

- `supabase-storage.ts:34` — the path comes from `resourceFilePath`, which already collapses `/` and
  `\` to `-`; a pre-existing test proves `../../etc/passwd.pdf` → `..-..-etc-passwd.pdf`. The guard
  was real but *implicit*, so it is now documented, and the one unsound edge (a filename of only
  dots would emit a key ending in `/`) is closed.
- `client-fetch.ts:95` — zero `console.*` in the file. It forwards caller options and sets the header.
- `questions-view.tsx:769` — `el.innerHTML = sanitizeRichText(...)`. Sanitised.
- `seed.ts:88` — logs the bootstrap admin's *identifier* (`ADM/2026/001`, a staff ID). The password
  never appears.

---

# Part 2 — Structural debt

## D-1 · 32 files carry the same copy-pasted function

**This is the highest-leverage fix in the review.**

**32 of 56** API route files each define a byte-identical copy of:

```ts
function validationError(err: ZodError): NextResponse { … }
```

All 56 routes already import the shared `errorResponse()` from `src/lib/api/response.ts:8`. That helper handles `UnauthorizedError` → 401, `ForbiddenError` → 403, and everything else → 500 — but has **no `ZodError` → 422 branch**.

That single missing branch is the entire cause. Because the shared helper can't express 422, 32 files each grew their own. Consequences:

- The API emits **two different error envelopes**.
- Changing the 422 shape means **32 edits**.
- It violates `AGENTS.md` ("no inline utils/helpers inside `app/`").

**This diff propagated the pattern.** `src/app/api/admin/sessions/route.ts` is a new P7-5 file carrying copy number 33.

**Fix.** Add the `ZodError` → 422 branch to `errorResponse()`, then delete 32 local copies. One function, one envelope, one place to change.

## D-2 · `src/lib/types.ts` — 204 authoritative-looking dead lines

204 lines, ~30 hand-written interfaces mirroring every table (`User`, `Course`, `Question`, `Quiz`, `ContentItem`, …). **Imported by nothing.**

It is the most dangerous kind of dead file: it looks like the source of truth, contradicts `AGENTS.md` §2 ("`lib/db/schema.ts` is the single source of truth"), and nothing checks it — so a future agent can reasonably build against interfaces that have silently drifted from the schema.

**Fix.** Delete it, or generate it from `schema.ts`. Do not leave it hand-maintained.

Related: `src/lib/semester/index.ts:13` re-exports `ActiveSemester`, `SemesterName`, `SessionDates` from `./calendar`, while every consumer imports them from `@/lib/semester/calendar` directly. Two import paths for the same types.

## D-3 · Two tests that assert nothing

Covered above as R-6 and R-7. Grouped here because they share a cause: the suite has a structural blind spot, not a coverage gap.

**A route test that mocks the database cannot prove a database predicate.** The shared stub in `src/lib/testing/route-test.ts` ignores `where()` arguments, so a test asserting on a filter passes whether or not the filter exists. This is the wrong tool for SQL-level rules — which is exactly why `verify-video-exemption.ts` exists as a live script instead of a route test. That reasoning was correct and was not applied to R-6.

## D-4 · Complexity hotspots

The distribution is extremely skewed, which makes the raw count misleading: **2,917 functions analysed, 128 above threshold, but p90 cyclomatic complexity is 3 and the average is 1.9.** `maintainability_avg` 90.6. The codebase is not broadly complex — it has a handful of genuine offenders.

Worst offenders:

| Location | Cyclomatic | Note |
|---|---|---|
| `src/components/teaching/quiz-builder-view.tsx:113` | **79** | 26× p90. The worst file in the repo. 4 separable concerns in one body |
| `src/app/(student-aspirant)/dashboard/page.tsx:399` | 63 | |
| `src/app/(admin)/admin/structure/courses/page.tsx` | 49 | route-group path; `fallow`'s line attribution for this one resolved to a blank line, so treat the location as file-level |
| `src/app/api/admin/content/route.ts:141` | 34 | |
| `src/app/(admin)/admin/settings/semester/page.tsx:50` | 24 | |
| `src/app/api/me/route.ts:24` | 24 | |
| `src/components/admin/session-manager.tsx:83` | 20 | new in this diff |

Worst by maintainability index: `questions-view.tsx` (43.8), `admin/content/route.ts` (28.3), `select.tsx` (27.9), `client-fetch.ts` (27.5), `input-group.tsx` (20.4).

`quiz-builder-view.tsx` is the one worth acting on: it is in the diff, it is the worst in the repo, and 79 strongly implies four concerns that can be separated without behaviour change.

---

# Part 3 — Verified clean

Negative results are evidence. These were checked and found correct; do not re-litigate them without new information.

**RLS — the designated top check, and it passes.** Verified at all three layers for the new `academic_sessions` table:

- `src/lib/db/schema/academic-sessions.ts:59` — `denyPublicPolicy("academic_sessions")`
- `src/lib/db/schema/academic-sessions.ts:61` — `.enableRLS()`
- `drizzle/0008_material_thor.sql:60` — emits `ALTER TABLE "academic_sessions" ENABLE ROW LEVEL SECURITY`
- `drizzle/0008_material_thor.sql:62` — emits `CREATE POLICY "academic_sessions_deny_public" … USING (false) WITH CHECK (false)`
- `drizzle/meta/0008_snapshot.json` — `isRLSEnabled: true`

All **28** tables were audited, not just the new one: 28 `pgTable`, 28 `enableRLS`, 29 `denyPublicPolicy` (28 call sites + 1 definition). `courses.session_id` is a new column on an already-protected table. `drizzle/0001_black_mordo.sql:52-62` revoked grants on tables, sequences, and schema, plus `ALTER DEFAULT PRIVILEGES`. **`DESIGN.md` §11's two-layer claim holds.**

**IDOR and roles.** All 53 route handlers swept. Every one calls `requireAuth()`. Every `/api/admin/*` passes `["admin"]`. Teacher routes pass `["admin","teacher"]` plus ownership checks. Role is resolved from the DB by `roleId` and **never trusted from the token payload** (`src/lib/auth/guard.ts:45-56`), so a stale token cannot elevate. `forbiddenUnlessOwned` returns 404 rather than 403 (`src/app/api/teacher/results/[quizId]/route.ts:88`), which does not confirm existence.

**Held scores.** Enforced in the response *shape* at every layer, not hidden in the UI — which is what `AGENTS.md` §3 demands:

- `attempt/route.ts:649-658` returns only `scoreStatus: "held"`
- `me/attempts/route.ts:146` strips the score
- `teacher/results/[quizId]/route.ts:113-129` builds a separate projection that never selects the `score` column

**Teacher video-only carve-out is genuinely closed.** `videoCreateSchema` (`src/lib/validation/content.ts:50`) pins `z.literal("video")` at `:52`. `teacher/resources/route.ts:132` hard-codes `type: "video"` and ignores any body field. GET filters `type='video'`. PATCH and DELETE re-check `existing.type !== "video"`. A crafted `{"type":"pdf"}` cannot widen it.

**JWT.** HS256 (`src/lib/auth/jwt.ts:14`) pinned at verify time via `algorithms: [ALG]` (`src/lib/auth/jwt.ts:37`), foreclosing `alg: none` and algorithm confusion. Payload is `{userId, roleId}` only — no PII, no role name. Role is re-read from the DB.

**Migration `0008`.** No `SET ROLE`, `GRANT`, `SECURITY DEFINER`, or dynamic SQL. All literals. Idempotent. Correct add-nullable → backfill → `SET NOT NULL` ordering. Atomic within a single `session.transaction`. The snapshot was **not** hand-edited and chains to `0007`. Uses `ON CONFLICT DO NOTHING`. The NULL backfill fails loudly rather than silently. `0001`'s grants already cover the new table.

**`semester_settings_override_pair` CHECK.** Correct, and forbids nothing legitimate.

**Staff-ID Zod-only enforcement is sufficient.** Only 2 write paths, both *generating* rather than accepting identifiers. The seed validates new ones, grandfathers existing ones, then `onConflictDoNothing`. (The absence of a DB CHECK was a deliberate decision: a CHECK cannot reference another table, so "Teachers must be `STF-###`, Admins exempt" is inexpressible, and a blanket CHECK would lock the only Admin out of the portal.)

**Session filtering.** `getActiveSemester()` is the sole resolver; no inline `new Date()` in any query path. `studentCanAccessQuiz` (`src/lib/quizzes/access.ts:68-77`) checks session **and** semester **and** level.

**Secrets.** No `.env*` file is tracked — only `.env.example`. `.gitignore:4` covers `.env.*`.

**Storage paths.** `slugifyPathSegment` (`src/lib/storage/content-paths.ts:14-20`) collapses everything outside `[a-z0-9]` to `-`, so the new session segment cannot escape the bucket. `resourceFilePath:48` strips `/` and `\`.

**Video link parsing.** `parseVideoLink:150-155` rejects non-http(s) schemes, closing stored `javascript:` and `data:` XSS. The host allowlist is exact-match, not suffix — so `evil-google.com` does not match `google.com`.

---

# Part 4 — `fallow` audit

**Verdict: FAIL.** 60 files, 216 hunks, +5,626 net lines. `risk_class: high`, `review_effort: deep_dive`.

Attribution (introduced / inherited):

| Category | Introduced | Inherited |
|---|---|---|
| Dead code | 5 | 3 |
| Complexity | 7 | 20 |
| Duplication | 28 | 37 |
| Styling | 56 | 1 |

The diff **introduced** more duplication (28) than it inherited — consistent with D-1, where the new `admin/sessions/route.ts` adds a 33rd copy.

### Dead code — 88 issues, ~9 real

| Signal | Count | Assessment |
|---|---|---|
| Unused exports | 62 | **53 are shadcn primitives** in `src/components/ui/`. 9 real. |
| Unused types | 21 | 17 vestigial `z.infer` aliases in `lib/validation/` |
| Unused file | 1 | `src/lib/types.ts` — see D-2 |
| Unused class members | 2 | `UnauthorizedError.status`, read via a generic union the analyser can't see |
| Unresolved imports | 2 | `next-env.d.ts` → `./.next/dev/types/*.d.ts` — **false positive**, generated Next types |
| Circular dependencies | **0** | |
| Unused dependencies | **0** | |

The 21 unused types are one pattern: `LevelCreateInput`, `QuizCreateInput`, `QuestionDraftInput` and similar, declared beside their Zod schemas with `uses_in_file=1` — definition only, zero uses — because routes validate against the schema object directly.

> **Do not run `fallow fix`.** All 62 unused exports are marked `auto_fixable: true`, but 53 are shadcn primitives. `fix` would strip the component library.

---

# Part 5 — `fallow-review` contract loop

The walkthrough guide was fetched (`graph_snapshot_hash: graph:c258ec40ccc12062`) and the loop completed: 10 signal_ids emitted, 5 decisions surfaced, 6 collapsed. All 5 were `public-api-contract` signals with `internal_consumer_count == blast` and `out_of_diff: 0`.

Five judgments were written to `/tmp/opencode/fallow/judgments.json` and post-validated against the live graph — **accepted 5, rejected 0**, all fenced `deterministic: false`. They are framings for human judgement, not findings; none is independently verifiable without a second opinion, which is the point of the fencing.

| # | Location | Framing | Stance |
|---|---|---|---|
| 1 | `src/lib/validation/structure.ts:5` | 6 consumers, all in-diff, so no cross-PR risk — but `structure.ts:55` carries cyclomatic 16, suggesting the schemas grew cross-field refinements instead of staying flat. Next change to any of them is 6 edits. | `consider` / compatibility |
| 2 | `src/lib/db/schema/courses.ts:17` | `courses`, `topics`, 4 consumers. `session_id` NOT NULL is the anchor of P7-5 identity. The type change is safe; the hand-edited migration is the risk — it writes to `courses` in production and is not re-runnable. | `address` / data-model |
| 3 | `src/components/teaching/quiz-builder-view.tsx:78` | 2 consumers, holds cyclomatic **79** (26× p90), in a file this diff changes. 4 separable concerns are almost certainly in one body. | `address` / control-flow |
| 4 | `src/components/shell/student-user-menu.tsx:94` | 2 consumers **outside** the diff, so nothing forces an update. Loose reads keep compiling and silently render the wrong session, since `/api/me` `activeSemester` changed shape to `{semester, sessionLabel, source}`. | `address` / api-ergonomics |
| 5 | `src/components/admin/admin-nav.tsx:85` | 2 consumers outside the diff. The recorded decision was "no new nav item" for the session manager, yet `admin-nav.tsx` changed. Doc and implementation may now disagree. | `consider` / coupling |

**Subtract line:** "handled deterministically: 8 dead-code, 65 duplication clone groups, 27 complexity, 57 styling." Deprioritized: 0.

Judgments #4 and #5 both flag the same class of risk: **two consumers outside the diff means no compile error forces the update.** That is worth remembering independently of whether these framings hold.

---

# Part 6 — Method, and how to re-run this

## How the review was produced

Four independent layers, deliberately chosen so that a defect had to fool more than one:

1. **`fallow audit`** — deterministic static analysis over the diff.
2. **`fallow-review`** — graph-grounded framings with post-validation against the live graph.
3. **`@review` subagent** — code review on correctness and behaviour.
4. **`@audit` subagent** — security review, with a designated top check.

The value came from disagreement between them. R-3 was found independently by layers 3 and 4 from opposite directions — one noticing the missing guard, one noticing the invariant contradicted by the schema comment. R-2 was found by layer 4 and then confirmed by hand against vendored Drizzle source. Neither would have been caught by a single pass.

## Re-running

```bash
# Layer 1 — static analysis
fallow audit --base origin/main
fallow health

# Layer 2 — contract loop (writes /tmp/opencode/fallow/judgments.json)
fallow review --base origin/main --walkthrough-file

# Layers 3 and 4 — the subagent prompts are described in Part 6 above
```

## Tool notes for whoever runs this next

- `fallow` JSON keys differ from intuition: `path` not `file`; `export_name`, `parent_name`, `member_name`, `specifier`; actions use `type` not `action`. My first auto-fixable count came back 0 because of the last one.
- `fallow review` clamps the decision cap to 5 regardless of `--max-decisions 10`.
- No `.fallowrc.json` exists (`config --path` exits 3). `impact.enabled: false`, `onboarding_declined: false`.
- `fallow audit` attribution reports `styling_introduced: 56` but the audit JSON carries no styling detail block, so that number cannot be broken down.
- Substring grepping is unreliable for type names: `ActiveSemester` appears in 11 files but mostly *inside* `getActiveSemester`. Always exclude the function name before concluding a type is used.
- In zsh, `--include=*.ts` must be quoted (`--include='*.ts'`) or the glob fails.

## What this document is not

It is a record of findings at commit `62d8a74`. It is not a sign-off. Two of the items above — R-1 and R-3 — require a decision that belongs to the Board, and R-2 has not been fixed despite being confirmed and unambiguous. This file describes the state of the code, not the state of the plan.

## Related

| File | What it holds |
|---|---|
| `DESIGN.md` | The data model, route map, business rules, identifier formats (§2), session calendar (§8), RLS rationale (§11) |
| `STATE.md` | Task state. R-1's Board decision is recorded at line 114 — the same line that is currently wrong |
| `PLAN.md` | Phase and task definitions |
| `ARIORI.md` | Solution log |
| `.agents/design/` | Per-screen wireframes and page specs |
| `~/.agents/reports/dos-app-new/dev-report.html` | Generated build report (outside the repo by policy; not committed) |