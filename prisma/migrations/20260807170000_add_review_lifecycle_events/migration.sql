CREATE TYPE "ReviewEventType" AS ENUM ('SNAPSHOT', 'COMPLETED', 'FAILED', 'CANCELLED');

ALTER TABLE "reviews"
    ADD COLUMN "event_sequence" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "review_events" (
    "review_id" VARCHAR(25) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "ReviewEventType" NOT NULL,
    "status" "ReviewStatus" NOT NULL,
    "processing_generation" INTEGER NOT NULL,
    "result_available" BOOLEAN NOT NULL,
    "retryable" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_events_pkey" PRIMARY KEY ("review_id", "sequence"),
    CONSTRAINT "review_events_sequence_check" CHECK ("sequence" BETWEEN 1 AND 2147483646),
    CONSTRAINT "review_events_processing_generation_check"
        CHECK ("processing_generation" BETWEEN 0 AND 2147483646)
);

CREATE INDEX "review_events_review_id_sequence_idx"
    ON "review_events"("review_id", "sequence");

ALTER TABLE "reviews"
    ADD CONSTRAINT "reviews_event_sequence_check"
    CHECK ("event_sequence" BETWEEN 0 AND 2147483646);

INSERT INTO "review_events" (
    "review_id",
    "sequence",
    "type",
    "status",
    "processing_generation",
    "result_available",
    "retryable",
    "created_at"
)
SELECT
    "id",
    1,
    CASE "status"
        WHEN 'COMPLETED' THEN 'COMPLETED'::"ReviewEventType"
        WHEN 'FAILED' THEN 'FAILED'::"ReviewEventType"
        WHEN 'CANCELLED' THEN 'CANCELLED'::"ReviewEventType"
        ELSE 'SNAPSHOT'::"ReviewEventType"
    END,
    "status",
    "processing_generation",
    "status" = 'COMPLETED',
    CASE WHEN "status" = 'FAILED' THEN FALSE ELSE NULL END,
    "updated_at"
FROM "reviews";

UPDATE "reviews"
SET "event_sequence" = 1;

ALTER TABLE "review_events"
    ADD CONSTRAINT "review_events_review_id_fkey"
    FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
