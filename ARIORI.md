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

*(Both items closed 2026-09-30 — see entry 5. Kept here as the record of what was outstanding
when this entry was written: the published-quiz edit lock, and the missing admin-shell twin.)*

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

---

## 3. The video player didn't load — our own CSP was blocking it

**Reported:** "Why can't I watch the video resources that uses Google Drive link on the site?
Will YouTube link also do the same? 'cus this was what I got: *This content is blocked.
Contact the site owner to fix the issue.*"

### What was actually wrong

Nothing to do with Google Drive. `next.config.ts` set `default-src 'self'` and **declared no
`frame-src`**. A CSP falls back `frame-src` → `child-src` → `default-src`, so `'self'` applied
to frames and the browser refused **every** cross-origin iframe.

Chrome renders a refused frame as *"This content is blocked. Contact the site owner to fix the
issue"* — and "the site owner" there is the **embedding** page, i.e. us. That wording is why it
read like a Google fault.

**Answer to the second question: yes, YouTube would have done exactly the same.** No provider
could have loaded. The player was never broken by a host — it was broken before it reached one.

Cause of the miss: the `iframe` was added without checking the app's CSP. The parser, the URLs
and the tests were all correct; the page could never have rendered them.

### The change

```js
"frame-src 'self' https://drive.google.com https://www.youtube.com",
```

Exactly the two hosts `lib/content/video-link.ts` can produce an `embedUrl` for. Providers that
return `embedUrl: null` — Telegram, Drive folders, unknown hosts — keep getting a plain link, so
nothing else needs framing. `frame-ancestors 'none'` is untouched: that governs who may frame
*us*, and should stay locked.

Also added a hint under the player, because the next failure mode is Drive's own: a file not
shared "Anyone with the link" shows Drive's request-access screen *inside* the frame, and
**Watch** is the way around it.

### Verification

- `pnpm typecheck` clean, `pnpm lint` 0 errors.
- **Not confirmed in a browser.** The header is read at server start, so this needs a dev-server
  restart or a redeploy before it can be tested. If a blocked message still appears after that,
  the wording matters — a *different* message means a different cause.

---

## 4. Teacher accounts — generated staff IDs, generated passwords, subject assignment, change-password

### What was actually wrong

The original `/api/admin/teachers` POST took an admin-chosen **identifier and password** and
returned the identifier or null. Two practical problems: forced IDs are error-prone for a phone
admin entering a row of teachers, and an admin-typed password passed to a teacher (usually over
WhatsApp) gets reused, leaked, or both. It also gave teachers the **whole** question bank, so a
Chemistry teacher authored everything.

No malware was involved — a repo-wide hint-scanner (`scripts/guard.mjs`) was run and is clean
before touching anything, on the "[do not type it here]" principle: the name sticks in
conversation logs otherwise.

### Decisions taken

| Question | Answer |
|---|---|
| Who chooses the ID / password | **Nobody — they are generated.** Sequential `STF-001`, `STF-002`, … (first free number over existing rows; non-`STF-` historical ids skipped). Password is 12 chars, unambiguous alphabet (no `I/O/l/0/1`). |
| When does the admin see the password? | **Exactly once** — on the 201 response, in a modal carrying the Board's exact message: *"Congratulations on join dos-app, {name} as a Teacher of {subjects}… Your Login credentials are: User ID / Password"* plus the change-password reminder. The modal is labelled **shown once**, warning to copy/save. |
| What does an admin assign at creation? | Courses and/or JAMB subjects (≥1 total). PATCH replaces the whole set, together — no half-scope states. |
| What can a teacher author? | **Only what is assigned.** The write routes themselves reject a payload outside the teacher's scope (fail-closed: no assignments → 403). Pickers are simply fed by `/api/teacher/subjects` (admin: whole catalogue; teacher: assigned only), so the UI can't offer what the API rejects. |
| Can a teacher change their password? | **Yes** — `POST /api/auth/change-password` existed; the missing half was the screen. `/account/password` (role-agnostic, shared header menu) closes the one-time-password loop the modal instructs. |

Deactivate still means `isActive: false`, never a hard delete — surnames worth keeping behind an
unrecovered account, and authorship refs must not dangle.

### What was built

- **Generation libs:** `src/lib/teachers/staff-id.ts` and `src/lib/teachers/password.ts`, fully
  unit-tested (monotone sequence, overlap with existing `STF-*` rows, retry path, no ambiguous
  chars).
- **`teacher_subjects` table** (`src/lib/db/schema/teachers.ts`, migration
  `drizzle/0007_worthless_swarm.sql` — generated **and applied** to the dev DB): multi-assignment,
  course XOR subject enforced by a CHECK, both partial unique indexes. RLS enabled and a
  deny-all policy for `anon`/`authenticated` shipped in the same migration (the aggregate REVOKE
  layer lives in 0001's default-privileges, so per-table policy is all this one needs). Per
  AGENTS.md this table is reachable only through the Next.js API.
- **Enforcement lib:** `src/lib/auth/teaching-scope.ts` + tests. Every teacher authoring write
  (questions `[id]`/`bulk`, quizzes, topics `[id]`, resources) now resolves the caller's
  assignments before writing and 403s anything outside them. Admins bypass scope.
- **Admin screen rebuilt:** `/admin/teachers` — Add dialog (name + Course/JAMB multi-selects),
  Edit dialog (name + set-replace), the one-time credentials modal, Deactivate/Reactivate,
  pagination. No passwords ever reappear on the list.
- **Pickers scoped:** `src/components/teaching/use-authoring-subjects.ts` feeds the topics,
  questions, quizzes and video views.
- **Change-password screen:** `/account/password` + header menu entry.

### Verification

- **Full suite: 694 tests across 60 files, all green.** Includes the reworked admin-teacher
  endpoint tests (37), the teaching-scope unit tests, and scope-stub + 403-isolation added to
  every teacher write route's colocated tests.
- `pnpm typecheck` clean; `pnpm lint` clean on changed files.
- Migration applied via `pnpm db:migrate`. 

### Still open

- The staff-ID format `STF-` is still board-unsanctioned: `DESIGN.md` fixes no format and
  validation stays lenient. If the Board sets one, tighten `lib/validation/`.
- A live in-browser pass over the create → copy credentials → teacher-login → authoring-scope
  loop still needs a dev-DB seed (the miles are covered by tests; the first real run is the
  admin creating teachers on the live platform).

---

## 5. Three open questions answered at last — quiz locking, admin results, and the semester

**Reported:** three items were sitting in `STATE.md` and the earlier entries' "Still open"
sections, each needing a decision rather than code: can a published quiz be fixed after the
fact, should the Teacher results screen exist for Admins too, and is the 404-vs-403 on someone
else's quiz intentional. A fourth question turned up mid-session and turned out to be the more
serious one: the app currently thinks a school session is still running.

### What was decided

1. **A published quiz can be unpublished first.** An Admin (or the quiz's owner) pulls it back
   to draft, edits, republishes. Deliberately *not* "Admin may edit while students are mid-attempt".
2. **Unpublishing is blocked for good once any score is released.** A 409 names the count and
   says why.
3. **`/admin/results` gets built**, at `/admin/results`, in the sidebar next to Score Release.
4. **404 is correct for another Teacher's quiz** — the spec was wrong, and was amended to match
   the code.

### Why #1 is an unpublish and not an edit-anyway

The original open question was "may an Admin edit a quiz while students are mid-attempt". The
answer is no, because editing is not a text change — `passMark`, `questionCount` and the
attached question set are *scoring inputs*. Change them under live attempts and everyone's mark
silently changes underneath them, with no record of what it used to be. Unpublishing avoids the
question: the quiz is off the menu, so nobody starts it while it is being fixed, and a teacher
mid-attempt keeps the paper they were given.

The released-score block is the same argument, one step further. `released_at` is not just a
visibility flag — a released Course Quiz score feeds CGPA and the Post-UTME projection
(`DESIGN.md` §4/§5), and both are derived, not stored. Once a mark is out, the number is already
in someone's record. So: **before release, editable via unpublish; after release, permanently
frozen.** The endpoint answers 409 with the count rather than a generic refusal, so the person
clicking knows it is the *scores*, not their permissions, that stopped them.

No migration was needed — `contentStatusEnum` is `["draft","published"]`, so unpublishing is a
status flip back, not a new state.

The button went in the shared `quiz-builder-view.tsx`, which both `/teacher/quizzes/[id]` and
`/admin/quizzes/[id]` already rendered with a different `basePath`. One edit, both shells — the
Board was offered "API only, no UI" and declined it, so the confirm dialog ships too.

### Why #3 needed no API work

`GET /api/teacher/results` and `GET /api/teacher/results/[quizId]` were already
`requireAuth(["admin","teacher"])`, and `ownershipScope()` returns `null` for a non-teacher — so
an Admin was already getting the site-wide list, not a filtered one, from a route named
`/teacher`. The components took a `basePath` prop for exactly this. So the twin is two five-line
page files and one nav entry.

The one thing that *did* need fixing: the empty state hardcoded `href="/teacher/quizzes"`, which
would have thrown an Admin sitting in the Admin shell into the Teacher shell. It now derives
from `basePath`, along with the eyebrow and description copy ("Admin — every quiz that has been
sat, across all staff" vs "Teacher — quizzes of yours").

Held-score handling is unchanged: this is a *view*, and `avgScore`/`passRate` stay released-only.
Release still happens only on `/admin/scores/release`.

### Why 404 beat 403

A 403 means "this exists, and it isn't yours". On a route keyed by a guessable integer, that is
an existence oracle for every other Teacher's quizzes. 404 costs nothing — the caller learns the
quiz is not theirs, which is all they need — and it matches what
`GET /api/teacher/quizzes/[id]` already did. The spec said 403; the spec was amended, with the
reasoning inline so nobody "fixes" it back later.

### The fourth question, which turned out to be a live bug

While checking the open items, the semester gap was investigated properly. The admin toggle is
fine — `GET/PATCH /api/admin/settings/semester`, the settings page and `getActiveSemester()` are
all correctly wired, and the toggle genuinely drives the five call sites that filter on it.

The bug is one level down. `SESSION_CALENDAR` covers 2025/26 and ends `rainEnd: 2026-07-03`.
`resolveSemesterForDate` has no third state — the last two lines both return `"rain"` — so since
3 July the app has been reporting **`rain`** as the active semester for a session that ended
three months ago. Since `lib/quizzes/access.ts` refuses a quiz whose `course.semester` doesn't
match, **every Harmattan-tagged course's quizzes and PDFs are currently invisible to students,
while every Rain-tagged one is open.**

The manual override cannot rescue it. The override is a *term* picker, and a finished whole
session is a shape its two values cannot express. `DESIGN.md` §8 built the override for date
drift, and this is the failure mode it does not cover. The real root cause is that the data model
has no session year: `semesterEnum` is `["harmattan","rain"]` on both `courses.semester` and
`semester_settings.manual_override`, so nothing anywhere records 2025/26 vs 2026/27.

**Decision taken: plan it, don't build it this session.** Recorded as `P7-5` in `PLAN.md` and
`STATE.md` with the two options costed — (a) add a `closed` third value to the enum and surface
the resolved semester in the admin UI, small but courses still need re-tagging every session, or
(b) put the session year in the data model and make the toggle the source of truth, correct
long-term but a real migration through the quiz and resource filters. A semantically empty
workaround was deliberately not taken: leaving it is wrong, and hardcoding 2026/27 dates would
paper over the shape of the problem while making the next rollover break again.

### Also closed

- **Vercel deploy (P8-5).** Already done on the Board's side — the project exists, connected to
  the GitHub repo, live in production. No code.
- **Logo (P8-6).** Board chose to keep the current placeholder. Closed rather than deleted, so
  the choice is on the record and nobody re-opens it.

### Verification

- `POST /api/teacher/quizzes/[id]/unpublish` — **10 new tests**, all green: happy path, the
  released-count 409 (asserted on message *and* that `db.update` was never called), already-draft
  409, an Admin unpublishing a quiz they don't own, 404, 403 not-owned, 400 × 2, 401, 403 role.
- The `/admin/results` pages add no new API surface, so they ride the existing 14 colocated
  result-route tests, which already cover Admin access.
- `pnpm typecheck` clean. `pnpm lint` 0 errors, 1 pre-existing warning
  (`client-fetch.ts:23`, `no-location-assign-relative-destination`) unrelated to this work.
  `pnpm vitest run src/app/api/teacher/quizzes src/app/api/teacher/results src/components` —
  107 tests across 9 files, green.

### Still open

- Nothing here has been exercised in a browser against the dev DB — no attempt data with a
  released score exists yet, so the 409 freeze path is covered by tests only.

---

## 6. "Students can't see Harmattan content" — the calendar was code, and it had expired

**The report.** After 2026-07-03 students found their Harmattan quizzes and PDFs gone. Not a
permissions bug, not a data problem: the whole session calendar lived in `lib/semester/calendar.ts`
as a hardcoded 2025/26 constant, and `resolveSemesterForDate` had no state for "the session is
over" — its last two branches both returned `rain`. So from 2026-07-04 onward the app reported
**`rain` as the active semester** for a session that had ended three months earlier, and
`lib/quizzes/access.ts:63` filtered on it. Every Harmattan-tagged course was invisible; every
Rain-tagged one was open.

**Why the manual override could not save it.** `DESIGN.md` §8 built that toggle for exactly this
date drift — but the override is a *term* picker, and a finished whole session is a shape
`harmattan | rain` cannot express. There was no value to select, so no admin action could make
the app correct. That is the tell: an escape hatch whose value space cannot reach the failure
state is not an escape hatch.

**Decided.** Board picked putting the session year in the data model. I flagged that on its own
it does not stop the re-tagging treadmill — an Admin would still re-tag every course each
session — so the Board then chose **one row per offering**: `CSC 201 · 2025/26 · Harmattan` and
`CSC 201 · 2026/27 · Harmattan` are two rows, and re-offering is a new row, never an edit.
Quizzes, content and attempts stay bound to the offering they belong to, so a 2025/26 result
feeding CGPA can never be relabelled 2026/27.

**The gap is solved without a third state.** `Jul 3 → Oct 20` resolves to the most recently
*started* session at its *final* semester — today, 2025/26 Rain, which is the material students
just sat. That is §8's existing "fall back to whichever semester just ended" rule generalised from
between-semesters to between-sessions, so §8's "not a third semester state" rule survives intact.
I costed a `closed` enum value and rejected it: it would have made the state legible without
making the app correct, and it would not have touched the annual re-tag. I also did not
hardcode 2026/27 dates to make the symptom disappear — that is the same class of bug one deploy
later, and it would have hidden a data-model gap behind a date.

**What else fell out of it.** The migration was unrunnable as generated — `ADD COLUMN session_id
integer NOT NULL` cannot execute against a database holding course rows, and the new
`override_pair` CHECK would have rejected the Admin's existing manual-override row. Both were
confirmed against the live dev database *before* rewriting it, so the fix is add-nullable → seed
→ backfill → `SET NOT NULL`, not a hopeful guess. A test also caught Rain's first day resolving
to Harmattan (`<=` where `<` was meant), and passing through the new session picker exposed a
`resolveStudentFolder` bug that had been filing Harmattan uploads into Rain folders all along.

### Still open

- 2026/27 dates are unknown, so no 2026/27 session exists. That is now a five-field form entry
  rather than a code change.
- Nothing here has been exercised in a browser against the dev DB. The resolver itself has been
  verified against the live database, not just in tests.
