ALTER TABLE "reviews"
    ADD COLUMN "processing_generation" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "reviews"
    ADD CONSTRAINT "reviews_processing_generation_check"
    CHECK ("processing_generation" BETWEEN 0 AND 2147483646);
