-- Review source is retained as untrusted data only. It is never executed by the API.
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TYPE "ReviewMode" AS ENUM ('QUICK', 'STANDARD', 'DEEP');

CREATE TABLE "reviews" (
    "id" VARCHAR(25) NOT NULL,
    "user_id" VARCHAR(25) NOT NULL,
    "source" VARCHAR(100000) NOT NULL,
    "language" VARCHAR(32) NOT NULL,
    "mode" "ReviewMode" NOT NULL DEFAULT 'STANDARD',
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reviews_user_id_deleted_at_created_at_idx"
    ON "reviews"("user_id", "deleted_at", "created_at");

CREATE INDEX "reviews_user_id_status_deleted_at_created_at_idx"
    ON "reviews"("user_id", "status", "deleted_at", "created_at");

ALTER TABLE "reviews"
    ADD CONSTRAINT "reviews_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
