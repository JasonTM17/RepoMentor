-- Change identifiers to bounded text so new records use Prisma CUID values.
-- Existing UUID identifiers are deterministically remapped to CUID-shaped values
-- before the foreign key is restored, so this append-only migration is data-safe.
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_fkey";
ALTER TABLE "users" DROP CONSTRAINT "users_pkey";
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_pkey";

ALTER TABLE "users" ADD COLUMN "id_cuid" VARCHAR(25);
UPDATE "users"
SET "id_cuid" = 'c' || substr(md5("id"::text), 1, 24);

ALTER TABLE "sessions" ADD COLUMN "id_cuid" VARCHAR(25);
UPDATE "sessions"
SET "id_cuid" = 'c' || substr(md5("id"::text), 1, 24);

ALTER TABLE "sessions" ADD COLUMN "user_id_cuid" VARCHAR(25);
UPDATE "sessions" AS s
SET "user_id_cuid" = u."id_cuid"
FROM "users" AS u
WHERE s."user_id" = u."id";

ALTER TABLE "users" ALTER COLUMN "id_cuid" SET NOT NULL;
ALTER TABLE "sessions" ALTER COLUMN "id_cuid" SET NOT NULL;
ALTER TABLE "sessions" ALTER COLUMN "user_id_cuid" SET NOT NULL;

ALTER TABLE "users" DROP COLUMN "id";
ALTER TABLE "users" RENAME COLUMN "id_cuid" TO "id";
ALTER TABLE "sessions" DROP COLUMN "id";
ALTER TABLE "sessions" RENAME COLUMN "id_cuid" TO "id";
ALTER TABLE "sessions" DROP COLUMN "user_id";
ALTER TABLE "sessions" RENAME COLUMN "user_id_cuid" TO "user_id";

ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");

CREATE INDEX "sessions_user_id_status_idx" ON "sessions"("user_id", "status");
CREATE INDEX "sessions_user_id_created_at_idx" ON "sessions"("user_id", "created_at");

ALTER TABLE "users" ADD COLUMN "display_name" VARCHAR(100) NOT NULL DEFAULT 'User';
ALTER TABLE "users" ALTER COLUMN "display_name" DROP DEFAULT;

ALTER TABLE "sessions" ADD COLUMN "user_agent" VARCHAR(512);
ALTER TABLE "sessions" ADD COLUMN "ip_hash" CHAR(64);

CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
