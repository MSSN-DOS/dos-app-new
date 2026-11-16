# Question bank implementation checklist

Scope: Teacher/Admin question bank only. Match `question-type-modal.png`, with
all five choices enabled and private image uploads working. Preserve existing
signed-in access, teaching scope, exact gap grading and manual essay grading.

- [x] Read the reference image, repository rules, current bank and quiz implementation.
- [x] Confirm scope: question bank only, all five types and images.
- [x] P14-1: Add shared document validation and private image schema/migration.
- [x] P14-2: Implement transactional save/load, publish validation and image APIs.
- [x] P14-3: Build the card modal and connect all five editors and image actions.
- [x] P14-4: Verify real persistence and quiz reuse, mobile/desktop, both themes and keyboard access.
- [x] P14-4: Pass Vitest, lint and typecheck; document completion.
- [ ] Sync this checklist to Todoist when the Rube/Todoist connector is available.

Todoist prerequisite: the requested skill requires `RUBE_SEARCH_TOOLS` and an
active Todoist connection. Neither tool is exposed in this session; no Todoist
tasks have been created. The local checklist is kept current during implementation.
