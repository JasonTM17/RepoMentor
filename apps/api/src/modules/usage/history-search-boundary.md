# Usage history search boundary

`GET /api/v1/usage/history?search=...` performs a bounded, case-insensitive
substring match against the persisted `Review.id` metadata field only.

The search does not inspect submitted source code, result content, or a title.
The Prisma `Review` model now stores optional bounded title metadata, but title
search remains outside this usage-history contract and is a P2 follow-up that
requires an explicit query and indexing decision.

History still applies the authenticated `userId` and `deletedAt IS NULL`
predicates to both the count and page queries. Search input is length-bounded
and restricted to review-id-safe characters before it reaches Prisma.
The Prisma LIKE/ILIKE boundary escapes `_` so an underscore remains a literal
review-ID character rather than a wildcard.
