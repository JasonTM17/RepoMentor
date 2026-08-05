# Database migration ownership

Phase 03 establishes the PostgreSQL Prisma tooling seam only. The schema has
no domain models and this phase deliberately creates no migration.

Phase 04 authentication owns the first real migration for the immutable
`User` and `Session` records. Migration history is append-only: once a
migration is applied or accepted, it is never rewritten. Later schema changes
must be expressed as new, strictly ordered forward migrations.
