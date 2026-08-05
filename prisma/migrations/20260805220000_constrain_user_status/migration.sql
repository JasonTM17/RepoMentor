-- Keep the persisted user status contract limited to active and disabled users.
UPDATE "users"
SET "status" = 'DISABLED'
WHERE "status" = 'SUSPENDED';

ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "UserStatus" RENAME TO "UserStatus_legacy";
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

ALTER TABLE "users"
ALTER COLUMN "status" TYPE "UserStatus"
USING ("status"::text::"UserStatus");

ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "UserStatus_legacy";
