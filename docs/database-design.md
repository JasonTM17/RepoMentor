# Database design

RepoMentor uses PostgreSQL through Prisma. The authoritative schema is
[`prisma/schema.prisma`](../prisma/schema.prisma); this document explains its
current relational boundaries without replacing the schema.

## Models and ownership

| Model            | Purpose                                                              | Ownership/relationship                                       |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| `User`           | Account identity, role, status, timestamps                           | Parent of sessions, reviews, and quota admissions            |
| `Session`        | Hashed refresh-session state and revocation metadata                 | Belongs to one user; cascades from the user                  |
| `Review`         | Submitted source, metadata, lifecycle status, and soft-delete marker | Belongs to one user; source is never a cross-user read       |
| `ReviewEvent`    | Ordered status lifecycle snapshots                                   | Belongs to a review; composite key is `(reviewId, sequence)` |
| `ReviewResult`   | Validated review JSON and safe execution metadata                    | One-to-one with a completed review                           |
| `ReviewUsage`    | Token counts associated with a result                                | One-to-one with a review result                              |
| `QuotaAdmission` | Idempotency, fingerprint, UTC-day, mode, and admission state         | Belongs to one user and one review                           |

The schema currently has no `AuditLog` model. Do not describe review history or
process events as a security audit trail; they are product lifecycle records.

Review and related repository methods require `userId` together with the record
ID. Prisma predicates include `deletedAt: null` and the owner ID for detail,
list, mutation, event, and result operations. The in-memory repositories mirror
that contract for deterministic tests. See
[`prisma-review.repository.ts`](../apps/api/src/modules/review/prisma-review.repository.ts)
and [`in-memory-review.repository.ts`](../apps/api/src/modules/review/in-memory-review.repository.ts).

## Lifecycle and invariants

Review statuses are `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, and
`CANCELLED`. Review events record ordered snapshots, completion, failure, or
cancellation with a processing generation. A result is persisted separately
and is read only for an owned, completed review.

Quota admissions use a bounded idempotency-key hash and request fingerprint,
with unique constraints preventing one user from creating conflicting records
for the same key. The Redis admission boundary and durable finalizer are
designed to fail closed or require reconciliation when the outcome is
indeterminate; deterministic tests do not prove live Redis atomicity.

## Migration policy

Migrations are forward-only and append-only. Once a migration is applied or
accepted, do not rewrite it; express changes as a new timestamped migration.
The ownership decision is recorded in
[`docs/architecture/database-migration-ownership.md`](architecture/database-migration-ownership.md).
The current migration history is visible under
[`prisma/migrations/`](../prisma/migrations/).

For local schema preparation, use:

```text
pnpm db:validate
pnpm db:generate
```

These commands validate/generate against the Prisma schema and do not connect
to PostgreSQL. A deployment that owns a real database must review the migration
SQL, take the required backup, and apply forward migrations using the approved
Prisma deployment process; no live migration run is claimed by this checkpoint.

## Data handling limits

Review source is bounded by application policy and stored in `Review.source`.
Source, titles, context, generated results, and usage metadata require the same
owner boundary as the review. The schema does not provide cross-tenant search,
retrieval indexes, or a deletion/audit retention service beyond the current
soft-delete and relational cascade behavior. Any future RAG storage must add an
explicit tenant/project ownership and retention design before implementation.
