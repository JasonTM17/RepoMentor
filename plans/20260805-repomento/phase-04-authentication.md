# Phase 04 — Authentication

## Dependencies and ownership

- Depends on Phase 03.
- Auth API worker owns user/session schema follow-ups, password/token services,
  DTOs, guards, controllers, and API tests.
- Auth web worker owns login/register/session UX and tests after API contracts.

## Commit slices

- `feat(auth): add user and session persistence model`
- `feat(auth): implement password hashing service`
- `feat(auth): add registration and login flow`
- `feat(auth): implement refresh token rotation`
- `feat(auth): add logout and session revocation`
- `feat(web-auth): add login and registration pages`
- `test(auth): add authentication integration tests`

## Acceptance and validation

Argon2 hashes passwords; access tokens are short-lived; refresh tokens are
hashed at rest and only sent through hardened HttpOnly cookies; rotation detects
reuse; logout/logout-all/current-user/password change and RBAC work; user
enumeration is not leaked; integration tests cover ownership and failure paths.
