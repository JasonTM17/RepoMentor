CREATE TYPE "QuotaAdmissionStatus" AS ENUM (
    'PENDING',
    'RESERVED',
    'ADMITTED',
    'DENIED',
    'INDETERMINATE',
    'RECONCILE_REQUIRED'
);

-- review_id is preallocated before the Review row exists; owner-scoped
-- finalization must create that Review with this opaque id in a later slice.
CREATE TABLE "quota_admissions" (
    "id" VARCHAR(25) NOT NULL,
    "user_id" VARCHAR(25) NOT NULL,
    "idempotency_key_hash" CHAR(64) NOT NULL,
    "review_id" VARCHAR(25) NOT NULL,
    "mode" "ReviewMode" NOT NULL,
    "utc_day" DATE NOT NULL,
    "status" "QuotaAdmissionStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quota_admissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quota_admissions_user_id_idempotency_key_hash_key"
    ON "quota_admissions"("user_id", "idempotency_key_hash");

CREATE UNIQUE INDEX "quota_admissions_review_id_key"
    ON "quota_admissions"("review_id");

CREATE INDEX "quota_admissions_user_id_utc_day_mode_status_idx"
    ON "quota_admissions"("user_id", "utc_day", "mode", "status");

CREATE INDEX "quota_admissions_user_id_review_id_idx"
    ON "quota_admissions"("user_id", "review_id");

ALTER TABLE "quota_admissions"
    ADD CONSTRAINT "quota_admissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
