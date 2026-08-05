# Phase 05 — Review domain

## Dependencies and ownership

- Depends on Phase 04.
- Review API worker owns review modules, DTOs, policies, persistence, and API
  tests. Shared contract changes are coordinator-sequenced.

## Commit slices

- `feat(review): add code review persistence models`
- `feat(review): implement review creation workflow`
- `feat(review): add review detail and history endpoints`
- `feat(review): enforce review ownership authorization`
- `feat(review): add pagination and filtering contracts`
- `test(review): add review domain integration tests`

## Acceptance and validation

Create/list/detail/delete/retry/cancel seams exist with bounded input sizes;
status transitions are explicit; list responses omit full source by default;
User A cannot access or delete User B data; pagination and soft-delete behavior
are tested.
