# Usage history search boundary

`GET /api/v1/usage/history?search=...` performs a bounded, case-insensitive
substring match against the persisted `Review.id` metadata field only.

The search does not inspect submitted source code, result content, or a title.
The current Prisma `Review` model has no persisted title column; the title shown
by the current web surface is UI-only. Persisted title search is a P2 follow-up
that requires an explicit schema and migration decision.

History still applies the authenticated `userId` and `deletedAt IS NULL`
predicates to both the count and page queries. Search input is length-bounded
and restricted to review-id-safe characters before it reaches Prisma.
