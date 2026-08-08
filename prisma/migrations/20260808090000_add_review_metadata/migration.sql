CREATE TYPE "LearnerLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

ALTER TABLE "reviews"
    ADD COLUMN "learner_level" "LearnerLevel" NOT NULL DEFAULT 'INTERMEDIATE',
    ADD COLUMN "title" VARCHAR(80),
    ADD COLUMN "context" VARCHAR(500);

ALTER TABLE "reviews"
    ALTER COLUMN "learner_level" DROP DEFAULT;
