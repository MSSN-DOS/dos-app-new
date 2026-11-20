# Quiz UI completion checklist

Reference: `C:\Users\arior\Downloads\Mobile Devices\Quizboot.html`
Updated UI authority: `C:\Users\arior\Downloads\QUIZBOOT_SPEC.md` (received during implementation).
Branch: `ariori-dev-sync`

Status: P12-11 implemented and verified. Keep DOS theme
tokens, mobile-first layouts, custom JWT authentication, teaching scope and the
previously confirmed Admin score-release gate.

- [x] Inspect the reference's New quiz, Add question, menus and remaining features.
- [x] Confirm whether Multi-answer and Numeric questions are included.
- [x] Confirm whether the remaining reference features are included in this update.
- [x] Record the agreed task and dependencies in PLAN.md, STATE.md and screen specs.
- [x] Complete the New quiz flow: responsive form, validation, persistence and builder navigation.
- [x] Implement the Add question button/dropdown in the reference's placement and style using shadcn.
- [x] Connect every included question-type action to its functional editor.
- [x] Connect Question bank selection and Bulk paste with validation and usable error states.
- [x] Implement Multi-answer authoring, student inputs, exact-set grading and answer review.
- [x] Implement Numeric authoring, student inputs, tolerance/unit grading and answer review.
- [x] Implement per-question option shuffling and stable resumed ordering.
- [x] Implement limited attempt counts alongside single/unlimited attempts.
- [x] Implement draft autosave without lost edits, duplicate rows or revision races.
- [x] Implement editable header title and accurate save status.
- [x] Implement math and chemistry palettes with formula previews/examples.
- [x] Implement real released-score distributions, question analysis and attempt durations.
- [x] Implement question-paper preview, Print/PDF and optional answer key.
- [x] Confirm Unpublish behavior for recorded/started attempts.
- [x] Implement Unpublish/republish and the agreed lifecycle protections.
- [x] Add any required shared Zod, Drizzle and authenticated API changes with endpoint tests.
- [x] Verify saving, reloads, publishing and affected grading behavior.
- [x] Verify 320/390/768/1280px layouts, both themes, 44px targets and keyboard access.
- [x] Run focused tests, lint and typecheck; run the full suite after implementation settles.
- [x] Update tracking, review the diff, commit the completed changes and summarize verification.
- [x] Apply spec corrections: compact header/cards, single expanded card, More panel and simplified settings.
- [x] Add inline gap authoring/student inputs while preserving `[gap]` storage and shared grading.
- [x] Add A4 pagination, page footers, scaled paper preview and independent PDF download.
- [x] Add editable formula templates and image-paste resizing.

## Confirmed scope

The Board confirmed both additions and all listed remaining features. Ordinary
Multiple choice remains single-select; Multi-answer uses exact-set, all-or-nothing
grading. Numeric uses an absolute tolerance and displays the unit label.

Unpublish hides the quiz from new attempts, allows started attempts to finish,
and locks attempted questions/settings permanently to preserve grading history.
Republish restores access without changing that content.
Board resolved the spec conflicts: keep trimmed, case-insensitive exact-match gaps
without pipe-separated alternatives and retain independent bank copies. Preserve DOS
tokens, 44px touch targets, 16px mobile text and Admin score release over the demo defaults.

The reference contains synthetic result charts. Any implemented results views must
use real, permitted data and preserve the Admin release gate.

## Verification

- Full Vitest suite: 108 files, 1,186 tests passed; final focused checks also passed.
- Lint and typecheck pass; lint retains the existing client-fetch navigation warning.
- Development migrations 0013/0014 applied; real API, Storage, grading and lifecycle checks passed with exact synthetic cleanup.
- Browser: New quiz creation, inline gaps, science slots, shared option toolbar, autosave, mouse/touch reorder and both themes at 320/390/768/1280px.
- A4 preview and actual PDF download agree on four pages; PDF uses rasterized pages.
- Confirmed DOS decisions are recorded in DESIGN.md. No production database or deployment changes.
