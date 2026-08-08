-- Cost estimates are derived by the server from the versioned deployment pricing
-- configuration. Existing usage rows intentionally remain null.
ALTER TABLE "review_usages"
    ADD COLUMN "estimated_cost_micros" BIGINT,
    ADD COLUMN "pricing_version" VARCHAR(80);

ALTER TABLE "review_usages"
    ADD CONSTRAINT "review_usages_estimated_cost_micros_check"
    CHECK (
        "estimated_cost_micros" IS NULL
        OR "estimated_cost_micros" BETWEEN 0 AND 9007199254740991
    );

ALTER TABLE "review_usages"
    ADD CONSTRAINT "review_usages_cost_pair_check"
    CHECK (("estimated_cost_micros" IS NULL) = ("pricing_version" IS NULL));
