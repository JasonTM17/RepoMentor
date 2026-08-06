-- A completed review owns one validated result and, when supplied by Luna, one usage row.
-- The API validates the structured result before this transaction and the checks below
-- keep the persisted execution metadata bounded if another writer reaches the database.
CREATE TABLE "review_results" (
    "id" VARCHAR(25) NOT NULL,
    "review_id" VARCHAR(25) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "model" VARCHAR(64) NOT NULL,
    "reasoning_effort" VARCHAR(8) NOT NULL,
    "result_json" JSONB NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_results_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "review_results_provider_check" CHECK ("provider" = 'luna'),
    CONSTRAINT "review_results_model_check" CHECK ("model" = 'gpt-5.6-luna'),
    CONSTRAINT "review_results_reasoning_effort_check" CHECK ("reasoning_effort" IN ('low', 'medium', 'max')),
    CONSTRAINT "review_results_json_size_check" CHECK (pg_column_size("result_json") <= 1048576),
    CONSTRAINT "review_results_duration_ms_check" CHECK ("duration_ms" BETWEEN 0 AND 600000),
    CONSTRAINT "review_results_attempts_check" CHECK ("attempts" BETWEEN 1 AND 2)
);

CREATE TABLE "review_usages" (
    "id" VARCHAR(25) NOT NULL,
    "review_result_id" VARCHAR(25) NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "cached_input_tokens" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_usages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "review_usages_input_tokens_check" CHECK ("input_tokens" BETWEEN 0 AND 10000000),
    CONSTRAINT "review_usages_output_tokens_check" CHECK ("output_tokens" BETWEEN 0 AND 10000000),
    CONSTRAINT "review_usages_total_tokens_check" CHECK (
        "total_tokens" BETWEEN 0 AND 10000000
        AND "total_tokens" = "input_tokens" + "output_tokens"
    ),
    CONSTRAINT "review_usages_cached_input_tokens_check" CHECK (
        "cached_input_tokens" IS NULL
        OR "cached_input_tokens" BETWEEN 0 AND "input_tokens"
    )
);

CREATE UNIQUE INDEX "review_results_review_id_key" ON "review_results"("review_id");
CREATE UNIQUE INDEX "review_usages_review_result_id_key" ON "review_usages"("review_result_id");

ALTER TABLE "review_results"
    ADD CONSTRAINT "review_results_review_id_fkey"
    FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "review_usages"
    ADD CONSTRAINT "review_usages_review_result_id_fkey"
    FOREIGN KEY ("review_result_id") REFERENCES "review_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;
