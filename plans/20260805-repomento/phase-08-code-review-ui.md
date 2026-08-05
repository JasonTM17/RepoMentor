# Phase 08 — Code review UI

## Dependencies and ownership

- Depends on Phase 07.
- Web workers own disjoint feature folders: editor/form, result/issue views,
  diff/tests/questions, and route-level integration. Shared layout/config is
  coordinator-sequenced.

## Commit slices

- `feat(web-review): add Monaco code review editor`
- `feat(web-review): add review configuration form`
- `feat(web-review): connect review creation API`
- `feat(web-review): display streaming review progress`
- `feat(web-review): render structured review results`
- `feat(web-review): add issue filtering and line highlighting`
- `feat(web-review): add original and improved code diff`
- `feat(web-review): display generated tests and learning questions`

## Acceptance and validation

Responsive, accessible new-review and detail pages support loading/error/empty
states, validation, keyboard focus, cancel/retry, severity/category filters,
line highlighting, copy/download, diff view, assumptions, limitations, usage,
and processing duration without exposing raw backend errors.
