# DOS Site — Page/Screen Specs

Index of every screen in the app, one entry per route from `DESIGN.md` §9. Each entry is a self-contained wireframe + layout + page spec: what's on the screen, how it's structured, what data it needs, and what states it must handle. This is the level agents should build *from* — `DOS-Site-Wireframes.html` (one directory up) is the original low-fidelity sketch these were derived from; these files are the authoritative, current spec.

## Files

| File | Screens |
|---|---|
| `screens-auth.md` | Login, Register (Student/Aspirant), Onboarding |
| `screens-admin.md` | All 12 Admin screens |
| `screens-teacher.md` | All 6 Teacher screens |
| `screens-student.md` | Student dashboard, quiz attempt, history, resources |
| `screens-aspirant.md` | Aspirant dashboard, quiz attempt, history, resources |

## How to use this while building

1. Find the task in `STATE.md` (e.g. `P5-1`).
2. Find the matching screen entry here (each entry lists its Task ID).
3. Build to that spec. If the spec is silent on something, check `DESIGN.md` before improvising — don't invent UI behavior that has a business-logic consequence (e.g. what happens to a held score) without checking it's actually specified somewhere.
4. If a screen genuinely needs something not covered here or in `DESIGN.md`, flag it per `AGENTS.md` §6 rather than guessing.

## Wireframe notation (used in every entry below)

Plain-text pseudo-wireframe, matching the vocabulary already used in `DOS-Site-Wireframes.html`'s CSS classes — so a `FRAME` maps to a `.frame`, a `STAT` to a `.stat`, etc. This is layout intent, not pixel-accurate — real visual design follows `DESIGN.md` §11 tokens and the `frontend-design` skill.

```
FRAME: <name of this card/section>
  STAT ROW: [ label: value ] [ label: value ]     -- .stat row
  FIELD: label -> [ input/select description ]     -- form field
  LIST ROW: primary text | secondary text | pill   -- .list-row
  ACTION ROW: [Button] [Button: primary]            -- .btn / .btn.primary
  NOTE: helper/disclaimer text                       -- .note
```

Nesting = visual stacking order top to bottom within a page, in the order shown.

## Shared conventions across all screens

- **Every guarded screen** renders nothing (not even a flash of layout) until `requireAuth`'s client-side equivalent confirms role — show a full-page loading state first, per `AGENTS.md` §1 rule about not leaking structure before auth resolves.
- **Every list/table screen** needs three states beyond the happy path: loading (skeleton, not spinner-only), empty (a specific message, not a blank area), error (retry action, not a silent failure).
- **Every screen touching quiz scores** must respect held-vs-released at the data layer, not the display layer — see `DESIGN.md` §4 "Score release" and `AGENTS.md` §3.
- **Color/spacing/typography**: always the tokens in `DESIGN.md` §11, never ad hoc values — see `AGENTS.md` §1.
